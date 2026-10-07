/**
 * Runtime Gate 2.1 contract helpers.
 *
 * This module intentionally does not select an Agent by a hard-coded id. The
 * Runtime passes its current capability registry to findRequirementsExpert().
 * The event validator is used by E2E tests and by read-back tools; it accepts
 * additional Runtime events, but enforces the Gate 2.1 ordering and evidence.
 */

export const REQUIREMENTS_EVENT_ORDER = Object.freeze([
  'requirement_worker_started',
  'requirement_artifact_created',
  'expert_review_requested',
  'expert_called',
  'expert_decision_received',
  'controller_review_requested',
  'controller_called',
  'controller_decision_received',
  'review_applied'
]);

export const REQUIREMENTS_DECISIONS = Object.freeze(new Set([
  'pass', 'revise', 'blocked', 'needs_human'
]));

export const CONTROLLER_DECISIONS = Object.freeze(new Set([
  'approved', 'revision_required', 'blocked', 'needs_human'
]));

const KEYWORDS = /requirements?|requirement\s+analysis|requirement\s+review|product\s+requirements|需求|产品需求/i;
const DISABLED = new Set(['disabled', 'inactive', 'revoked']);

function flatText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flatText).join(' ');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key} ${flatText(item)}`).join(' ');
  return '';
}

/** Find a registered, enabled local requirements capability. */
export function findRequirementsExpert(registry) {
  if (!Array.isArray(registry)) return null;
  return registry.find(entry => {
    if (!entry || DISABLED.has(String(entry.status || '').toLowerCase())) return false;
    const remote = entry.local === false || /^(remote|cloud|external)$/i.test(String(entry.execution || entry.runtime || entry.provider || entry.scope || ''));
    const local = !remote && (entry.local === true || /local/i.test(flatText(entry)) || entry.entrypoint || entry.activation_scope || entry.runtime_gate);
    return local && KEYWORDS.test(flatText(entry));
  }) || null;
}

function firstEvent(events, type, start = 0) {
  return events.slice(start).find(event => event?.type === type || event?.action === type || event?.event_name === type) || null;
}

function eventType(event) {
  return event?.type || event?.action || event?.event_name || '';
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() && !/^(unknown|human|none|null)$/i.test(value.trim());
}

/**
 * Validate a requirements Gate 2.1 event trace.
 * Returns an array of stable error codes; [] means the trace satisfies the
 * contract. `expected` can be `pass`, `revise`, or `needs_human` for branch
 * specific assertions.
 */
export function validateRequirementsEvents(events, { taskId, nodeId, expected = null, registeredControllerIds = [] } = {}) {
  const errors = [];
  if (!Array.isArray(events)) return ['events_not_array'];
  const scoped = events.filter(event => !taskId || !event.task_id || event.task_id === taskId);
  const indices = REQUIREMENTS_EVENT_ORDER.map(type => scoped.findIndex(event => eventType(event) === type));
  const absent = REQUIREMENTS_EVENT_ORDER.filter((type, index) => indices[index] < 0);
  if (absent.length) errors.push(`missing_events:${absent.join(',')}`);
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] >= 0 && indices[i - 1] >= 0 && indices[i] <= indices[i - 1]) errors.push(`event_order:${REQUIREMENTS_EVENT_ORDER[i - 1]}->${REQUIREMENTS_EVENT_ORDER[i]}`);
  }

  for (const event of scoped.filter(item => nodeId && item.node_id && item.node_id !== nodeId)) errors.push(`node_mismatch:${eventType(event)}`);
  const started = firstEvent(scoped, 'requirement_worker_started');
  const artifact = firstEvent(scoped, 'requirement_artifact_created');
  if (!started) errors.push('requirement_worker_started_missing');
  if (!artifact || artifact.exists !== true || !nonEmpty(artifact.path) || !nonEmpty(artifact.fingerprint) || !nonEmpty(artifact.artifact_id)) errors.push('requirement_artifact_evidence');

  const expertCall = firstEvent(scoped, 'expert_called');
  const expertDecisionEvent = firstEvent(scoped, 'expert_decision_received');
  const expertDecision = expertDecisionEvent?.decision || expertDecisionEvent?.payload?.decision || null;
  if (expertCall && !nonEmpty(expertCall.expert_id || expertCall.agent_id)) errors.push('expert_id_missing');
  if (expertDecision && !REQUIREMENTS_DECISIONS.has(expertDecision)) errors.push('expert_decision_invalid');
  if (expertDecisionEvent && (expertDecisionEvent.expert_review_round ?? expertDecisionEvent.review_round) !== 1) errors.push('expert_review_round');
  if (expertDecisionEvent && Number(expertDecisionEvent.max_review_rounds) !== 3) errors.push('expert_max_review_rounds');

  const controllerCall = firstEvent(scoped, 'controller_called');
  const controllerDecisionEvent = firstEvent(scoped, 'controller_decision_received');
  if (controllerCall) {
    const controllerId = controllerCall.agent_id || controllerCall.controller_agent_id || controllerCall.asset_id;
    if (!nonEmpty(controllerId) || /human/i.test(controllerId)) errors.push('controller_id_invalid');
    if (registeredControllerIds.length && !registeredControllerIds.includes(controllerId)) errors.push('controller_id_unregistered');
    for (const field of ['task_id', 'node_id', 'execution_id', 'review_round']) if (controllerCall[field] == null || controllerCall[field] === '') errors.push(`controller_called_${field}`);
    if (controllerCall.review_round !== 1) errors.push('controller_review_round');
  }
  const controllerDecision = controllerDecisionEvent?.decision || controllerDecisionEvent?.payload?.decision || null;
  if (controllerDecision && !CONTROLLER_DECISIONS.has(controllerDecision)) errors.push('controller_decision_invalid');
  if (controllerDecisionEvent && Number(controllerDecisionEvent.review_round) !== 1) errors.push('controller_decision_round');
  if (controllerDecisionEvent && Number(controllerDecisionEvent.max_review_rounds) !== 3) errors.push('controller_max_review_rounds');

  if (expected === 'pass') {
    if (expertDecision !== 'pass') errors.push('expert_not_pass');
    if (controllerDecision !== 'approved') errors.push('controller_not_approved');
    if (!firstEvent(scoped, 'stage_completed')) errors.push('stage_completed_missing');
    if (scoped.some(event => eventType(event) === 'stage_completed' && event.currentStage && event.currentStage !== 'interaction')) errors.push('current_stage_not_interaction');
    const appliedIndex = scoped.findIndex(event => eventType(event) === 'review_applied');
    const completedIndex = scoped.findIndex(event => eventType(event) === 'stage_completed');
    if (appliedIndex >= 0 && completedIndex >= 0 && completedIndex <= appliedIndex) errors.push('event_order:review_applied->stage_completed');
  } else if (expected === 'revise') {
    if (expertDecision !== 'revise') errors.push('expert_not_revise');
    if (controllerDecision !== 'revision_required') errors.push('controller_not_revision_required');
    if (!firstEvent(scoped, 'change_request_created')) errors.push('change_request_missing');
    if (scoped.some(event => eventType(event) === 'stage_completed')) errors.push('stage_completed_on_revision');
    const cr = firstEvent(scoped, 'change_request_created');
    for (const field of ['task_id', 'stage_id', 'node_id', 'base_artifact_id', 'base_version', 'review_round']) if (cr && (cr[field] == null || cr[field] === '')) errors.push(`change_request_${field}`);
    const decisionIndex = scoped.findIndex(event => eventType(event) === 'controller_decision_received');
    const changeIndex = scoped.findIndex(event => eventType(event) === 'change_request_created');
    const appliedIndex = scoped.findIndex(event => eventType(event) === 'review_applied');
    if (decisionIndex >= 0 && changeIndex >= 0 && changeIndex <= decisionIndex) errors.push('event_order:controller_decision_received->change_request_created');
    if (changeIndex >= 0 && appliedIndex >= 0 && appliedIndex <= changeIndex) errors.push('event_order:change_request_created->review_applied');
  } else if (expected === 'needs_human') {
    if (expertDecision !== 'needs_human' && !scoped.some(event => String(event.reason || '').includes('no_registered_requirements_expert'))) errors.push('needs_human_missing');
    if (scoped.some(event => eventType(event) === 'stage_completed')) errors.push('stage_completed_on_needs_human');
  }
  return [...new Set(errors)];
}
