import test from 'node:test';
import assert from 'node:assert/strict';
import { findRequirementsExpert, validateRequirementsEvents } from '../scripts/requirements-gate-contract.mjs';

const controller = 'registered-master-controller';
const common = { task_id: 'TASK-REQ-1', node_id: 'NODE-2', execution_id: 'RUN-REQ-1', review_round: 1, max_review_rounds: 3 };
function event(type, extra = {}) { return { type, ...common, ...extra }; }
function passTrace() {
  return [
    event('requirement_worker_started', { agent_id: 'registered-requirement-worker' }),
    event('requirement_artifact_created', { artifact_id: 'artifact-req-1', path: 'runtime/artifacts/req.md', fingerprint: 'sha256:req', exists: true }),
    event('expert_review_requested'),
    event('expert_called', { expert_id: 'registered-requirement-expert' }),
    event('expert_decision_received', { decision: 'pass', expert_review_round: 1 }),
    event('controller_review_requested', { agent_id: controller }),
    event('controller_called', { agent_id: controller }),
    event('controller_decision_received', { agent_id: controller, decision: 'approved' }),
    event('review_applied', { decision: 'approved' }),
    event('stage_completed', { currentStage: 'interaction' })
  ];
}

test('finds a local registered requirements capability without hard-coded ids', () => {
  const entry = findRequirementsExpert([
    { id: 'disabled-req', local: true, status: 'disabled', capability: 'requirements review' },
    { id: 'req-expert-from-registry', local: true, status: 'active', capability: 'product requirements analysis' }
  ]);
  assert.equal(entry.id, 'req-expert-from-registry');
  assert.equal(findRequirementsExpert([{ id: 'remote', provider: 'remote', capability: 'requirements' }]), null);
});

test('accepts the pass branch only after expert and controller gates', () => {
  assert.deepEqual(validateRequirementsEvents(passTrace(), { taskId: 'TASK-REQ-1', nodeId: 'NODE-2', expected: 'pass', registeredControllerIds: [controller] }), []);
});

test('rejects controller_called without required runtime fields', () => {
  const trace = passTrace().map(item => item.type === 'controller_called' ? { ...item, execution_id: null } : item);
  assert.ok(validateRequirementsEvents(trace, { taskId: 'TASK-REQ-1', nodeId: 'NODE-2', expected: 'pass', registeredControllerIds: [controller] }).includes('controller_called_execution_id'));
});

test('needs_human branch never completes the stage', () => {
  const trace = [
    event('requirement_worker_started', { agent_id: 'registered-requirement-worker' }),
    event('requirement_artifact_created', { artifact_id: 'artifact-req-2', path: 'runtime/artifacts/req.md', fingerprint: 'sha256:req2', exists: true }),
    event('expert_review_requested'),
    event('expert_decision_received', { decision: 'needs_human', reason: 'no_registered_requirements_expert', expert_review_round: 1 })
  ];
  const errors = validateRequirementsEvents(trace, { taskId: 'TASK-REQ-1', nodeId: 'NODE-2', expected: 'needs_human' });
  assert.ok(errors.some(error => error.startsWith('missing_events:')));
  assert.ok(!errors.includes('needs_human_missing'));
  assert.ok(!errors.includes('stage_completed_on_needs_human'));
});

test('revision branch records a scoped change request and stays in requirement', () => {
  const trace = [
    event('requirement_worker_started', { agent_id: 'registered-requirement-worker' }),
    event('requirement_artifact_created', { artifact_id: 'artifact-req-3', path: 'runtime/artifacts/req-v1.md', fingerprint: 'sha256:req3', exists: true }),
    event('expert_review_requested'),
    event('expert_called', { expert_id: 'registered-requirement-expert' }),
    event('expert_decision_received', { decision: 'revise', expert_review_round: 1, required_changes: ['补充验收标准'] }),
    event('controller_review_requested', { agent_id: controller }),
    event('controller_called', { agent_id: controller }),
    event('controller_decision_received', { agent_id: controller, decision: 'revision_required' }),
    event('change_request_created', { stage_id: 'requirement', base_artifact_id: 'artifact-req-3', base_version: 1, review_round: 1, expert_required_changes: ['补充验收标准'], controller_required_changes: ['补充验收标准'] }),
    event('review_applied', { decision: 'revision_required', status: 'revision_required' })
  ];
  assert.deepEqual(validateRequirementsEvents(trace, { taskId: 'TASK-REQ-1', nodeId: 'NODE-2', expected: 'revise', registeredControllerIds: [controller] }), []);
});
