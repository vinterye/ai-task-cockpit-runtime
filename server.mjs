import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, stat, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const HTML_FILE = path.join(ROOT, '总控交互原型.html');
const STATE_FILE = path.join(ROOT, 'runtime', 'state.json');
const RUNNER_FILE = path.join(ROOT, 'scripts', 'mvp-runner.mjs');
const LOCAL_RESEARCH_AGENT = '/Users/tianhua/agent-toolkit/design-research-agent/run.py';
const LOCAL_REQUIREMENT_CLI = '/Users/tianhua/ai-prototype-agent/cli.mjs';
const LOCAL_STAGE_WORKER = path.join(ROOT, 'scripts', 'stage-workers', 'run-worker.mjs');
const ARTIFACT_ROOT = path.join(ROOT, 'runtime', 'artifacts');
const STAGES = ['competitor', 'requirement', 'interaction', 'prototype', 'ui_design', 'development', 'testing'];
const STAGE_NAMES = { competitor: '竞品分析', requirement: '需求文档', interaction: '交互设计', prototype: '原型', ui_design: 'UI 设计', development: '开发', testing: '测试验收' };
const PRODUCT_PLATFORMS = ['web_app', 'mobile_app', 'wechat_mini_program', 'desktop_app', 'backend_api', 'cross_platform', 'undecided'];
const DELIVERY_GOALS = ['concept_demo', 'clickable_prototype', 'lowfi_demo', 'runnable_mvp', 'production_product'];
const PROJECT_TYPES = ['new', 'existing'];
const MASTER_CONTROLLER_ID = 'agent-master-controller-v1-1-master-controller-worker--4e450eb4';
const CONTROLLER_DECISION_SCHEMA = 'master-controller-decision/v0.1';
const CONTROLLER_DECISIONS = new Set(['approved', 'revision_required', 'blocked', 'needs_human']);
const REQUIREMENT_DECISIONS = new Set(['pass', 'revise', 'blocked', 'needs_human']);
const REQUIREMENT_SECTIONS = [
  ['目标与范围', /目标|范围/], ['用户与场景', /用户|场景/], ['核心问题', /核心问题|问题/],
  ['用户主路径', /主路径|用户流程|用户旅程/], ['功能需求', /功能需求|功能/],
  ['业务规则 / 异常', /业务规则|异常/], ['MVP 范围', /MVP|最小可行/], ['验收标准', /验收标准|验收/],
  ['Open Questions', /open questions|待确认|开放问题/i], ['Non-goals', /non-goals|不做|非目标/i],
  ['Requirement Coverage', /requirement coverage|需求覆盖|覆盖关系/i]
];
const STAGE_DOCUMENT_NODES = {
  competitor: [['overview', '分析概述'], ['subjects', '研究对象'], ['findings', '核心发现'], ['interaction-patterns', '关键交互模式'], ['difference-analysis', '差异分析'], ['conclusion', '研究结论'], ['follow-up-impact', '对后续影响'], ['artifact', '阶段产物']],
  requirement: [['overview', '需求总览'], ['goals-scope', '目标与范围'], ['users-scenarios', '用户与场景'], ['core-problems', '核心问题'], ['user-path', '用户主路径'], ['functional', '功能需求'], ['rules', '业务规则 / 异常'], ['mvp', 'MVP 范围'], ['acceptance', '验收标准'], ['open-questions', 'Open Questions'], ['non-goals', 'Non-goals'], ['coverage', 'Requirement Coverage'], ['artifact', '阶段产物']],
  interaction: [['overview', '交互总览'], ['user-path', '用户主路径'], ['page-workspace', '页面 / 工作区关系'], ['framework', 'Framework 规划'], ['module', 'Module 规划'], ['task-state', 'Task / State 规划'], ['fallback', '异常与回退'], ['flow', 'Expert / Controller 流转'], ['artifact', '阶段产物']],
  prototype: [['framework', 'Framework'], ['module', 'Module'], ['task', 'Task'], ['artifact', '阶段产物']],
  ui_design: [['inputs', '设计输入'], ['analysis', '设计分析'], ['pages', '页面'], ['components', '组件'], ['states', '状态样式'], ['tokens', 'Design Tokens'], ['artifact', '阶段产物']],
  development: [['contract', 'Technical Contract'], ['workspace', 'Task Workspace'], ['runtime', 'Runtime'], ['review', 'Review System'], ['shared', 'Shared'], ['artifact', '阶段产物']],
  testing: [['plan', '测试计划'], ['task-workspace', 'Task Workspace'], ['runtime', 'Runtime'], ['review', 'Review'], ['regression', 'Regression'], ['e2e', 'E2E'], ['blocking', 'Blocking Issues'], ['acceptance', 'Final Acceptance'], ['artifact', '阶段产物']]
};
const STAGE_STRUCTURED_FIELDS = {
  competitor: { overview: 'overview', subjects: 'research_subjects', findings: 'core_findings', 'interaction-patterns': 'interaction_patterns', 'difference-analysis': 'difference_analysis', conclusion: 'conclusion', 'follow-up-impact': 'downstream_impacts' },
  requirement: { overview: 'overview', 'goals-scope': 'goals_scope', 'users-scenarios': 'users_scenarios', 'core-problems': 'core_problems', 'user-path': 'main_path', functional: 'functional_requirements', rules: 'business_rules', mvp: 'mvp_scope', acceptance: 'acceptance_criteria', 'open-questions': 'open_questions', 'non-goals': 'non_goals', coverage: 'coverage' }
};
let state;
let writeQueue = Promise.resolve();
const runningProcesses = new Map();

function runLocalCommand(command, args, { input = '', env = {}, timeoutMs = 12000 } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    let settled = false;
    let timer;
    const finish = result => { if (settled) return; settled = true; if (timer) clearTimeout(timer); resolve(result); };
    timer = setTimeout(() => { if (!child.killed) child.kill('SIGTERM'); finish({ code: null, signal: 'SIGTERM', timed_out: true, stdout, stderr: `${stderr}\nLOCAL_AGENT_TIMEOUT_${timeoutMs}MS` }); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => finish({ code: null, signal: null, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code, signal) => finish({ code, signal, timed_out: false, stdout, stderr }));
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

async function invokeRegisteredStageAgents(task, executionId) {
  const request = String(task.requirement || task.name || '').trim();
  const artifactDir = task.latest_execution?.artifact ? path.posix.dirname(path.posix.dirname(task.latest_execution.artifact)) : `runtime/artifacts/${task.id}/${executionId}`;
  const workerInput = JSON.stringify({ task_id: task.id, run_id: executionId, requirement: request, artifact_dir: artifactDir });
  const invocations = [
    {
      stage_id: 'competitor', agent_id: 'design-research-agent', entrypoint: LOCAL_RESEARCH_AGENT,
      command: 'python3', args: [LOCAL_RESEARCH_AGENT, '--request', request],
      env: { P0_DISPATCH_PAYLOAD: JSON.stringify({ research_v02: { context: { action: 'produce_draft', size: 'large', research_needed: true } } }) }, timeoutMs: 30000
    },
    {
      stage_id: 'requirement', agent_id: 'requirement-agent', entrypoint: LOCAL_REQUIREMENT_CLI,
      command: process.execPath, args: [LOCAL_REQUIREMENT_CLI, 'cmd'],
      input: JSON.stringify({ command: '需求', input: request }), timeoutMs: 30000
    },
    {
      stage_id: 'interaction', agent_id: 'interaction-agent', entrypoint: LOCAL_STAGE_WORKER,
      command: process.execPath, args: [LOCAL_STAGE_WORKER, 'interaction'], input: workerInput
    },
    {
      stage_id: 'development', agent_id: 'implementation-worker', entrypoint: LOCAL_STAGE_WORKER,
      command: process.execPath, args: [LOCAL_STAGE_WORKER, 'development'], input: workerInput
    },
    {
      stage_id: 'testing', agent_id: 'test-worker', entrypoint: LOCAL_STAGE_WORKER,
      command: process.execPath, args: [LOCAL_STAGE_WORKER, 'testing'], input: workerInput
    }
  ];
  for (const invocation of invocations) {
    appendEvent(task, 'agent', `调用已登记本地 Agent：${invocation.agent_id}`, 'system', {
      kind: 'agent', action: 'agent_called', status: 'running', agent_id: invocation.agent_id,
      entrypoint: invocation.entrypoint, stage_id: invocation.stage_id, execution_id: executionId,
      role_in_node: '按 AIOS Registry 登记入口执行阶段适配器'
    });
    const result = await runLocalCommand(invocation.command, invocation.args, { input: invocation.input, env: invocation.env, timeoutMs: invocation.timeoutMs || 12000 });
    let payload = null;
    try { payload = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).at(-1) || '{}'); } catch { payload = null; }
    const nativeStatus = result.timed_out ? 'needs_human' : (result.code === 0 ? (payload?.status || 'completed') : (payload?.status || 'blocked'));
    const adapted = adaptNativeStageResult(task, invocation, payload || {}, executionId, nativeStatus);
    task.stage_agent_results ||= {};
    task.stage_agent_results[invocation.stage_id] = adapted;
    for (const node of task.documents?.nodes || []) if (node.stage_id === invocation.stage_id) {
      const field = STAGE_STRUCTURED_FIELDS[invocation.stage_id]?.[node.section_id];
      const value = field ? adapted.structured_content?.[field] : null;
      const isOverview = node.section_id === 'overview';
      node.document_id = isOverview ? adapted.stage_document.document_id : (node.document_id || `DOC-${task.id}-${invocation.stage_id}-${node.id}`);
      node.node_id = isOverview ? adapted.stage_document.node_id : node.id;
      node.content_status = isOverview ? adapted.stage_document.status : (value == null ? 'unknown' : adapted.status);
      node.content = isOverview ? adapted.stage_document.content : (value == null ? {} : { summary: structuredNodeSummary(value), value });
      node.producer = adapted.stage_document.producer;
      node.validation = adapted.validation;
      node.native_output_ref = adapted.native_output_ref;
      node.run_id = executionId; node.task_id = task.id; node.updated_at = now();
    }
    appendEvent(task, 'agent', `本地 Agent 回执：${invocation.agent_id} · ${adapted.status}`, 'system', {
      kind: 'agent', action: 'agent_completed', status: adapted.status, native_status: nativeStatus, agent_id: invocation.agent_id,
      entrypoint: invocation.entrypoint, stage_id: invocation.stage_id, execution_id: executionId,
      exit_code: result.code, signal: result.signal, timed_out: Boolean(result.timed_out), agent_result: payload,
      stdout: result.stdout.slice(-12000), stderr: result.stderr.slice(-12000),
      role_in_node: '保留真实本地入口回执；未将候选或阻塞伪装为阶段完成'
    });
  }
  await recordUnavailableStageWorkers(task, executionId);
}

async function recordUnavailableStageWorkers(task, executionId) {
  const targets = [
    { stage_id: 'interaction', node_id: 'interaction.overview', agent_id: 'interaction-agent' },
    { stage_id: 'development', node_id: 'development.workspace', agent_id: 'implementation-worker' },
    { stage_id: 'testing', node_id: 'testing.plan', agent_id: 'test-worker' }
  ];
  task.stage_agent_results ||= {};
  for (const target of targets) {
    const existing = task.stage_agent_results[target.stage_id];
    if (existing && (existing.status === 'ready' || existing.status === 'completed') && existing.native_status === 'completed') continue;
    const registered = await agentRegistryPayload(target.agent_id);
    const reason = registered?.entrypoint ? 'entrypoint_not_connected_to_runtime' : 'no_registered_local_entrypoint';
    const status = registered?.status === 'active' || registered?.status === 'verified' ? 'blocked' : 'not_run';
    const result = { schema_version: 'stage-agent-result/v1', task_id: task.id, run_id: executionId,
      stage_id: target.stage_id, node_id: target.node_id, agent_id: target.agent_id, status,
      structured_content: {}, artifact_refs: [], evidence_refs: [], validation: { status, missing: ['entrypoint'], unknown: [] },
      reason, recorded_at: now() };
    task.stage_agent_results[target.stage_id] = result;
    appendEvent(task, 'agent', `${target.agent_id} 未进入真实执行：${reason}`, 'system', {
      kind: 'agent', action: 'agent_capability_gap', status, agent_id: target.agent_id,
      stage_id: target.stage_id, node_id: target.node_id, execution_id: executionId, reason,
      role_in_node: 'Registry 驱动的能力缺口记录，不把缺失 Worker 伪装成阶段完成'
    });
  }
}

function adaptNativeStageResult(task, invocation, payload, executionId, nativeStatus) {
  const raw = JSON.stringify(payload, Object.keys(payload).sort());
  const nativeOutputRef = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  let structuredContent = payload.structured_content || payload.requirement_document || payload.research_brief || payload.prototype || payload.content || {};
  if (invocation.stage_id === 'requirement' && (!structuredContent || !Object.keys(structuredContent).length)) {
    structuredContent = Object.fromEntries(['goals_scope', 'users_scenarios', 'core_problems', 'main_path', 'functional_requirements', 'business_rules', 'exceptions', 'mvp_scope', 'acceptance_criteria', 'open_questions', 'non_goals', 'coverage', 'agent_routing'].map(field => [field, 'unknown']));
  }
  if (invocation.stage_id === 'competitor' && ['blocked', 'needs_human'].includes(nativeStatus) && (!structuredContent || !Object.keys(structuredContent).length)) {
    const reason = payload.blocked_reason || payload.next_step || 'external competitor evidence required';
    structuredContent = Object.fromEntries(['overview', 'research_subjects', 'core_findings', 'interaction_patterns', 'difference_analysis', 'conclusion', 'downstream_impacts'].map(field => [field, `Blocked: ${reason}`]));
  }
  const requiredByStage = {
    competitor: ['overview', 'research_subjects', 'core_findings'],
    requirement: ['goals_scope', 'users_scenarios', 'acceptance_criteria']
  }[invocation.stage_id] || [];
  const missing = requiredByStage.filter(field => !structuredContent?.[field]);
  const status = ['blocked', 'failed', 'needs_human'].includes(nativeStatus) ? 'blocked' : (missing.length ? 'unknown' : 'ready');
  const validation = { status, missing, unknown: missing.length ? [] : [] };
  const nodeId = `${invocation.stage_id}.overview`;
  return {
    schema_version: 'stage-agent-result/v1', task_id: task.id, run_id: executionId,
    stage_id: invocation.stage_id, node_id: nodeId, status, native_status: nativeStatus,
    native_output_ref: nativeOutputRef, structured_content: structuredContent,
    artifact_refs: payload.artifact_refs || [], evidence_refs: payload.evidence_refs || [],
    validation, agent_id: invocation.agent_id, version: payload.version || 'unknown',
    entrypoint: invocation.entrypoint, payload, stage_document: {
      schema_version: 'stage-document/v1', document_id: `DOC-${task.id}-${invocation.stage_id}-${nodeId}`,
      task_id: task.id, run_id: executionId, stage_id: invocation.stage_id, node_id: nodeId,
      parent_id: null, title: (STAGE_DOCUMENT_NODES[invocation.stage_id] || [])[0]?.[1] || nodeId,
      node_type: 'root', status, content: structuredContent, children: [], artifact_refs: payload.artifact_refs || [],
      evidence_refs: payload.evidence_refs || [], source_refs: payload.source_refs || [],
      producer: { agent_id: invocation.agent_id, version: payload.version || 'unknown' }, validation,
      native_output_ref: nativeOutputRef, created_at: now(), updated_at: now()
    }, recorded_at: now()
  };
}

function structuredNodeSummary(value) {
  if (value == null || value === '') return 'Unknown / 尚无证据';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

async function loadState() {
  state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  state.projects ||= [];
  state.changeRequests ||= [];
  let changed = false;
  for (const project of state.projects) for (const task of project.tasks || []) {
    if (!task.documents?.nodes?.length) {
      task.documents = { schema_version: 'stage-document/v1', source: 'runtime_backfill', nodes: makeDocumentNodes() };
      changed = true;
    }
  }
  if (changed) await queueSave();
  return state;
}

function queueSave() {
  const snapshot = JSON.stringify(state, null, 2) + '\n';
  writeQueue = writeQueue.then(() => writeFile(STATE_FILE, snapshot, 'utf8'));
  return writeQueue;
}

function now() { return new Date().toISOString(); }
function allTasks() { return state.projects.flatMap(project => (project.tasks || []).map(task => ({ project, task }))); }
function findTask(taskId) { return allTasks().find(({ task }) => task.id === taskId) || null; }
function appendEvent(task, type, message, stream = 'system', details = {}) {
  task.events ||= [];
  const id = `EVT-${randomUUID()}`;
  const event = { id, event_id: id, sequence: task.events.length, at: now(), task_id: task.id,
    execution_id: task.latest_execution?.execution_id || null, run_id: task.latest_execution?.execution_id || null, stage_id: task.currentStage || null,
    type, stream, message, ...details };
  if (event.action && !event.event_name) event.event_name = event.action;
  task.events.push(event);
  return event;
}
async function exists(relativePath) {
  if (!relativePath) return false;
  return stat(path.resolve(ROOT, relativePath)).then(() => true, () => false);
}
async function inspectExistingProject(projectPath) {
  const resolved = path.resolve(projectPath);
  try {
    const info = await stat(resolved);
    if (!info.isDirectory()) return { path: projectPath, status: 'unavailable', detected: [], reason: 'PATH_NOT_DIRECTORY' };
    const entries = await readdir(resolved, { withFileTypes: true });
    const names = entries.map(entry => entry.name);
    const known = ['index.html', 'package.json', 'README.md', 'src', 'public', 'app', 'server.mjs', 'server.js', 'vite.config.js', 'tsconfig.json'];
    return { path: projectPath, status: 'connected', detected: known.filter(item => names.includes(item)), entry_count: names.length };
  } catch (error) {
    return { path: projectPath, status: 'unavailable', detected: [], reason: error.code === 'ENOENT' ? 'PATH_NOT_FOUND' : 'PATH_UNREADABLE' };
  }
}
async function normalizeReferenceFiles(files) {
  if (!Array.isArray(files)) return [];
  return Promise.all(files.map(async item => {
    const localPath = item?.local_path || item?.path || null;
    const isPresent = localPath ? await exists(localPath) : false;
    return {
      id: String(item?.id || `ref-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      name: String(item?.name || 'Unknown'),
      type: String(item?.type || 'file'),
      size: Number.isFinite(Number(item?.size)) ? Number(item.size) : null,
      local_path: localPath,
      status: isPresent ? 'ready' : 'unknown'
    };
  }));
}
async function enrichTask(task, project) {
  const inspect = async item => {
    const present = await exists(item.path);
    let content = null;
    let html = false;
    if (present && item.path) {
      const info = await stat(path.resolve(ROOT, item.path));
      if (info.isFile() && info.size <= 256 * 1024) content = await readFile(path.resolve(ROOT, item.path), 'utf8');
      html = /<!doctype html|<html[\s>]/i.test(content || '');
    }
    const relative = item.path ? path.relative(ARTIFACT_ROOT, path.resolve(ROOT, item.path)) : '';
    const inRoot = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    const url = present && inRoot ? `/artifacts/${relative.split(path.sep).map(encodeURIComponent).join('/')}` : null;
    return { ...item, artifact_id: item.artifact_id || `artifact-${task.id}-${item.stage || 'runtime'}-${item.card_id || path.basename(item.path || 'unknown')}`, stage_id: item.stage_id || item.stage || null, node_id: item.node_id || item.card_id || null, local_path: item.local_path || item.path || null, exists: item.path ? present : null, fingerprint: present ? await fingerprint(item.path) : null,
      content: html ? null : content, content_url: url, preview_url: html ? url : null };
  };
  const artifact = task.artifact ? await inspect(task.artifact) : null;
  const artifacts = await Promise.all((task.artifacts || []).map(item => inspect(normalizeArtifactManifest(item, task, item.run_id || task.latest_execution?.execution_id || null))));
  const ui_demos = await Promise.all((task.ui_demos || []).map(async demo => ({ ...demo, exists: await exists(demo.artifact_path), artifact_url: demo.artifact_path ? `/artifacts/${path.relative(ARTIFACT_ROOT, path.resolve(ROOT, demo.artifact_path)).split(path.sep).map(encodeURIComponent).join('/')}` : null })));
  return { ...task, projectId: project.id, projectName: project.name, artifact, artifacts, ui_demos,
    change_requests: (state.changeRequests || []).filter(item => item.task_id === task.id),
    capability_registry: state.capability_registry || [],
    artifact_snapshots: task.artifact_snapshots || [] };
}
async function projectsPayload() {
  return { projects: await Promise.all(state.projects.map(async project => ({
    id: project.id, name: project.name, status: project.status, currentStage: project.currentStage,
    tasks: await Promise.all((project.tasks || []).map(task => enrichTask(task, project)))
  })))};
}
async function dashboardPayload() {
  const pairs = allTasks();
  const running = pairs.filter(({ task }) => task.status === 'running');
  const runningNodes = pairs.reduce((sum, { task }) => sum + (task.nodes || []).filter(node => node.status === 'running').length, 0);
  const blocked = pairs.reduce((sum, { task }) => sum + (task.nodes || []).filter(node => node.status === 'blocked').length, 0);
  const predictedIssues = pairs.reduce((sum, { task }) => sum + (task.nodes || []).filter(node => ['risk', 'failed'].includes(node.status)).length, 0);
  return { runningProjects: new Set(running.map(({ project }) => project.id)).size, runningNodes, blocked, predictedIssues, updatedAt: now() };
}
async function agentRegistryPayload(agentId = null) {
  const registryPath = '/Users/tianhua/AIOS/registry/agents.json';
  const capabilityPath = '/Users/tianhua/AIOS/capabilities/capabilities.json';
  const [registry, capabilities] = await Promise.all([
    readFile(registryPath, 'utf8').then(JSON.parse, () => ({ agents: [] })),
    readFile(capabilityPath, 'utf8').then(JSON.parse, () => ({ agents: [] }))
  ]);
  const caps = new Map((capabilities.agents || []).map(item => [item.agent_id, item]));
  const entries = (registry.agents || []).filter(item => !agentId || item.id === agentId).map(item => ({
    agent_id: item.id, version: item.version || null, status: item.status || 'unknown',
    entrypoint: item.entrypoint || item.path || null, input_contract: item.usage_card?.input_contract || 'unknown',
    output_contract: item.usage_card?.output_contract || 'unknown', capabilities: caps.get(item.id)?.capabilities || item.capabilities || [],
    test_pack_id: item.test_pack_id || null, runtime_gate: item.runtime_gate || item.decision_gateway || null,
    path: item.path || null, name: item.name || item.id
  }));
  return agentId ? entries[0] || null : entries;
}
function taskRuns(task) { return task.executions || (task.latest_execution ? [task.latest_execution] : []); }
function taskArtifactList(task) {
  const stageArtifacts = Object.values(task.stage_agent_results || {}).flatMap(result =>
    (result?.artifact_refs || []).map(item => ({
      ...item,
      stage_id: item.stage_id || result.stage_id,
      node_id: item.node_id || result.node_id,
      agent_id: item.agent_id || result.agent_id,
      run_id: item.run_id || result.run_id,
      manifest_schema_version: item.manifest_schema_version || 'artifact-manifest/v1'
    }))
  );
  const all = [task.artifact, ...(task.artifacts || []), ...stageArtifacts].filter(Boolean);
  const seen = new Set();
  return all.filter(item => {
    const key = item.artifact_id || `${item.path || item.local_path || 'unknown'}:${item.fingerprint || ''}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function findArtifactById(taskId, artifactId) {
  const found = findTask(taskId); if (!found) return null;
  return taskArtifactList(found.task).find(item => item.artifact_id === artifactId) || null;
}
async function artifactPayload(taskId, artifact) {
  if (!artifact) return null;
  const enriched = await enrichTask({ ...findTask(taskId).task, artifact }, findTask(taskId).project);
  return enriched.artifact;
}
async function taskDocuments(taskId, res) {
  const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  return json(res, 200, { task_id: taskId, schema_version: found.task.documents?.schema_version || 'stage-document/v1', nodes: found.task.documents?.nodes || [] });
}
async function taskDocumentNode(taskId, nodeId, res) {
  const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const node = (found.task.documents?.nodes || []).find(item => item.id === nodeId || item.node_id === nodeId);
  if (!node) return json(res, 404, { error: 'DOCUMENT_NODE_NOT_FOUND', node_id: nodeId });
  return json(res, 200, { task_id: taskId, schema_version: found.task.documents?.schema_version || 'stage-document/v1', node });
}
async function queryStage(taskId, stageId, res) {
  const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const nodes = (found.task.documents?.nodes || []).filter(node => node.stage_id === stageId);
  return json(res, 200, { task_id: taskId, stage_id: stageId, status: found.task.stages?.[stageId] || 'unknown', nodes });
}
async function queryNode(taskId, nodeId, res) {
  const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const node = (found.task.documents?.nodes || []).find(item => item.id === nodeId || item.node_id === nodeId || item.section_id === nodeId);
  if (!node) return json(res, 404, { error: 'NODE_NOT_FOUND', node_id: nodeId });
  return json(res, 200, { task_id: taskId, node });
}
async function queryRuns(taskId, runId, res) {
  const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const runs = taskRuns(found.task);
  if (!runId) return json(res, 200, { task_id: taskId, runs });
  const run = runs.find(item => item.execution_id === runId);
  if (!run) return json(res, 404, { error: 'RUN_NOT_FOUND', run_id: runId });
  return json(res, 200, { task_id: taskId, run_id: runId, run, events: (found.task.events || []).filter(event => event.execution_id === runId || event.run_id === runId) });
}
async function queryReviews(taskId, reviewId, req, res) {
  const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const artifact = taskArtifactList(found.task).find(item => item.exists === true) || taskArtifactList(found.task)[0] || null;
  const artifactEvidence = artifact ? {
    artifact_id: artifact.artifact_id || null,
    path: artifact.path || artifact.local_path || null,
    fingerprint: artifact.fingerprint || null,
    exists: artifact.exists === true
  } : null;
  const reviews = Object.entries(found.task.reviews || {}).map(([id, value]) => ({ review_id: id, reviewer: { kind: 'controller', id: found.task.reviewer || MASTER_CONTROLLER_ID }, verdict: String(value).split(' · ')[0], review_scope: 'task', review_round: found.task.review_round || 0, max_review_rounds: found.task.max_review_rounds || 3, evidence_refs: found.task.controller_review?.evidence_refs || [], artifact: artifactEvidence }));
  if (req.method === 'GET') return reviewId ? json(res, 200, { task_id: taskId, review: reviews.find(item => item.review_id === reviewId) || null }) : json(res, 200, { task_id: taskId, reviews });
  return json(res, 405, { error: 'METHOD_NOT_ALLOWED', allowed: ['GET'] });
}
async function projectTasks(projectId, res) {
  const project = state.projects.find(item => item.id === projectId);
  if (!project) return json(res, 404, { error: 'PROJECT_NOT_FOUND', project_id: projectId });
  return json(res, 200, { project_id: projectId, tasks: await Promise.all((project.tasks || []).map(task => enrichTask(task, project))) });
}
async function gatewayCallback(req, res) {
  const body = await readJson(req);
  const taskId = String(body.task_id || body.taskId || '').trim();
  const found = findTask(taskId);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', task_id: taskId });
  const { task } = found;
  const executionId = body.execution_id || body.run_id || task.latest_execution?.execution_id || null;
  const incoming = Array.isArray(body.events) ? body.events : [body.event || body];
  const accepted = [];
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    const action = item.event_name || item.action || item.type;
    if (!action) continue;
    accepted.push(appendEvent(task, item.type || 'gateway', item.message || `Gateway callback: ${action}`, item.stream || 'system', {
      ...item, action, event_name: action, execution_id: executionId, run_id: executionId,
      source: item.source || 'gateway_callback'
    }));
  }
  if (body.artifact && typeof body.artifact === 'object') {
    task.artifact = { ...(task.artifact || {}), ...body.artifact };
    task.artifact.exists = Boolean(body.artifact.exists);
  }
  await queueSave();
  return json(res, 202, { accepted: accepted.map(event => event.event_id), task_id: taskId, execution_id: executionId });
}
function filterEvents(events, url) {
  const stage = url.searchParams.get('stage_id');
  const node = url.searchParams.get('node_id');
  const action = url.searchParams.get('action') || url.searchParams.get('event_name');
  const type = url.searchParams.get('type');
  return events.filter(event => (!stage || event.stage_id === stage) && (!node || event.node_id === node) && (!action || event.action === action || event.event_name === action) && (!type || event.type === type));
}
function json(res, statusCode, payload) {
  if (res.__cockpitApiV1) {
    const requestId = res.__cockpitRequestId || `REQ-${randomUUID()}`;
    payload = {
      data: statusCode >= 400 ? null : payload,
      meta: { schema_version: 'cockpit-api/v1', request_id: requestId, source: 'runtime', generated_at: now() },
      error: statusCode >= 400 ? payload : null
    };
  }
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(payload));
}
function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
function makeStages() { return Object.fromEntries(STAGES.map(id => [id, 'pending'])); }
function makeNodes() { return STAGES.map((id, index) => ({ id: `NODE-${index + 1}`, stage: id, name: `${String(index + 1).padStart(2, '0')} ${STAGE_NAMES[id]}`, status: 'pending' })); }
function makeDocumentNodes() {
  const nodes = STAGES.flatMap(stageId => (STAGE_DOCUMENT_NODES[stageId] || []).map(([sectionId, title], order) => ({
    id: `${stageId}.${sectionId}`, stage_id: stageId, section_id: sectionId, category: sectionId, title,
    parent_id: null, order, status: 'pending', content_status: 'unknown', content: {}, children: [],
    artifact_refs: [], evidence_refs: [], producer: { agent_id: null, version: null }, schema_version: 'stage-document/v1'
  })));
  for (const stageId of STAGES) {
    const stageNodes = nodes.filter(node => node.stage_id === stageId);
    const root = stageNodes[0];
    for (const node of stageNodes.slice(1)) node.parent_id = root?.id || null;
    if (stageId === 'prototype') {
      const module = stageNodes.find(node => node.section_id === 'module');
      const task = stageNodes.find(node => node.section_id === 'task');
      if (task) task.parent_id = module?.id || root?.id || null;
    }
    for (const node of stageNodes) node.children = nodes.filter(child => child.parent_id === node.id).map(child => child.id);
  }
  return nodes;
}
function normalizeArtifactManifest(item, task, executionId) {
  const artifactId = item.artifact_id || `artifact-${task.id}-${executionId}-${item.card_id || item.stage || 'runtime'}`;
  return {
    ...item, artifact_id: artifactId, agent_id: item.agent_id || item.producer || 'unknown', run_id: item.run_id || executionId,
    artifact_version: item.artifact_version || item.version || 'v1', input_refs: item.input_refs || [task.id],
    output_refs: item.output_refs || [item.path].filter(Boolean), evidence_refs: item.evidence_refs || [item.path].filter(Boolean),
    test_pack: item.test_pack || null, validation: item.validation || { status: item.status || 'unknown' }, evolution: item.evolution || null,
    manifest_schema_version: 'artifact-manifest/v1'
  };
}
async function adaptStageDocuments(task, executionId) {
  task.documents ||= { schema_version: 'stage-document/v1', source: 'runtime', nodes: makeDocumentNodes() };
  const nodes = task.documents.nodes || [];
  const byStage = stageId => nodes.filter(node => node.stage_id === stageId);
  for (const stageId of STAGES) {
    const stageArtifact = (task.artifacts || []).find(item => item.stage === stageId || item.stage_id === stageId);
    const stageNodes = byStage(stageId);
    if (!stageNodes.length) continue;
    for (const node of stageNodes) {
      node.updated_at = now(); node.run_id = executionId; node.task_id = task.id;
      node.artifact_refs = node.section_id === 'artifact' && stageArtifact ? [stageArtifact.artifact_id] : [];
      node.evidence_refs = stageArtifact?.evidence_refs || [];
      node.producer = { agent_id: stageArtifact?.agent_id || stageArtifact?.producer || null, version: stageArtifact?.artifact_version || null };
      node.content_status = node.artifact_refs.length ? 'available' : 'unknown';
      node.content = node.artifact_refs.length ? { artifact_id: stageArtifact.artifact_id, path: stageArtifact.path, status: stageArtifact.status || 'unknown' } : {};
    }
    if (stageId === 'testing') {
      const plan = stageNodes.find(node => node.section_id === 'plan');
      if (plan) { plan.content_status = 'available'; plan.content = { cases: task.test_results || [], execution_id: executionId }; }
    }
  }
  task.documents.updated_at = now();
}
function taskFromRequirement(requirement) {
  const created = Date.now();
  const id = `TASK-${created}`;
  return {
    id, name: requirement.trim().slice(0, 48) || '本地需求执行任务', requirement: requirement.trim(), status: 'pending', currentStage: 'competitor', viewStage: 'competitor', executionMode: 'automated',
    stages: makeStages(), nodes: makeNodes(), events: [], reviewer: null, review_round: 0, max_review_rounds: 3, decision: null,
    artifacts: [], artifact: { artifact_id: `artifact-${id}-runtime-preview`, stage_id: 'prototype', node_id: 'prototype-preview', path: `runtime/artifacts/${id}/app/index.html`, local_path: `runtime/artifacts/${id}/app/index.html`, exists: false, producer: 'mvp-runner' },
    documents: { schema_version: 'stage-document/v1', source: 'runtime', nodes: makeDocumentNodes() }
  };
}


function getNodeWithDescendants(nodeId, nodes) {
  const byParent = new Map();
  for (const node of nodes || []) {
    const siblings = byParent.get(node.parent_id || null) || [];
    siblings.push(node);
    byParent.set(node.parent_id || null, siblings);
  }
  const root = (nodes || []).find(node => node.id === nodeId);
  if (!root) return [];
  const result = [];
  const visit = node => { result.push(node); for (const child of byParent.get(node.id) || []) visit(child); };
  visit(root);
  return result;
}

function resolveModifyScope(task, stageId, scopeNodeId, requestedNodeIds = []) {
  const nodes = Array.isArray(task.documents?.nodes)
    ? task.documents.nodes.filter(node => !node.stage_id || node.stage_id === stageId)
    : [];
  if (nodes.length && scopeNodeId) {
    const scoped = getNodeWithDescendants(scopeNodeId, nodes);
    if (scoped.length) return { nodeIds: scoped.map(node => node.id), mapping: 'document_nodes' };
  }
  const requested = Array.isArray(requestedNodeIds) ? [...new Set(requestedNodeIds.map(item => String(item).trim()).filter(Boolean))] : [];
  const prefix = scopeNodeId ? `${scopeNodeId}.` : '';
  if (scopeNodeId && requested.length && requested.every(id => id === scopeNodeId || id.startsWith(prefix))) {
    return { nodeIds: requested, mapping: 'validated_scope_ids' };
  }
  if (scopeNodeId && requested.length) return { nodeIds: [], mapping: 'invalid' };
  if (scopeNodeId) return { nodeIds: [scopeNodeId], mapping: 'root_only' };
  return { nodeIds: [], mapping: 'unavailable' };
}

async function fingerprint(relativePath) {
  if (!relativePath || !(await exists(relativePath))) return null;
  try {
    const bytes = await readFile(path.resolve(ROOT, relativePath));
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  } catch { return null; }
}

function resolveModifyRoute(task, stageId, nodeId = null, artifact = null) {
  const events = task.events || [];
  const previous = events.slice().reverse().find(event => event.stage_id === stageId && (!nodeId || !event.node_id || event.node_id === nodeId) && ['agent', 'rule', 'skill', 'workflow', 'harness'].includes(event.kind) && ['started', 'call_started', 'completed', 'success'].includes(event.action || event.status));
  if (previous) {
    const asset = previous.asset_id || previous.agent_id || previous.agent || previous.skill_id || previous.id;
    return { agent: asset, primary_worker: asset, kind: previous.kind, supporting_expert: 'Unknown / 未提供专家证据', source: 'previous_capability_event', registry: 'Unknown / 尚无 Registry 证据', reason: `当前节点最近一次真实 ${previous.kind} Event` };
  }
  if (stageId === 'development') return { agent: 'Codex / Implementation Worker', primary_worker: 'Codex / Implementation Worker', supporting_expert: 'frontend-technical-agent (只读 Review，未验证)', source: 'implementation_worker_default', registry: 'Unknown / 尚无 Registry 证据', reason: '开发修改由 Implementation Worker 执行，技术专家仅作为未验证的只读支持' };
  if (artifact?.producer && /agent|worker/i.test(String(artifact.producer))) return { agent: artifact.producer, primary_worker: artifact.producer, supporting_expert: 'Unknown / 未提供专家证据', source: 'artifact_producer', registry: 'Unknown / 尚无 Registry 证据', reason: '当前 Artifact producer 可作为候选 Worker，但没有新的执行证明' };
  const registry = Array.isArray(state.capability_registry) ? state.capability_registry : [];
  const candidate = registry.find(entry => entry.stage_id === stageId && entry.node_id === nodeId && entry.status !== 'disabled');
  if (candidate) return { agent: candidate.id || candidate.name, primary_worker: candidate.id || candidate.name, supporting_expert: 'Unknown / 未提供专家证据', source: 'capability_registry_match', registry: 'MATCHED', reason: 'Registry 匹配，仅作为候选路由，尚未代表 Used' };
  return { agent: 'Unknown / No Matching Capability', primary_worker: 'Unknown / No Matching Worker', supporting_expert: 'Unknown / 尚无专家证据', source: 'unknown', registry: 'Unknown / Registry unavailable', reason: '没有可验证的 Agent Event、Artifact Owner 或 Registry 匹配' };
}
async function createTask(req, res) {
  const body = await readJson(req);
  const idempotencyKey = String(body.idempotency_key || req.headers['idempotency-key'] || '').trim();
  if (idempotencyKey) {
    const existing = allTasks().find(({ task }) => task.idempotency_key === idempotencyKey);
    if (existing) return json(res, 200, { project: { id: existing.project.id, name: existing.project.name }, task: await enrichTask(existing.task, existing.project), idempotent: true });
  }
  const projectInput = body.project_input || {
    original_request: String(body.requirement || '').trim(),
    product_platform: 'undecided',
    delivery_goal: 'runnable_mvp',
    project_type: 'new',
    existing_project_path: null,
    reference_files: []
  };
  const requirement = String(body.requirement || projectInput.original_request || '').trim();
  if (!requirement) return json(res, 400, { error: 'REQUIREMENT_REQUIRED' });
  const productPlatform = String(projectInput.product_platform || 'undecided');
  const deliveryGoal = String(projectInput.delivery_goal || 'runnable_mvp');
  const projectType = String(projectInput.project_type || 'new');
  if (!PRODUCT_PLATFORMS.includes(productPlatform)) return json(res, 400, { error: 'INVALID_PRODUCT_PLATFORM' });
  if (!DELIVERY_GOALS.includes(deliveryGoal)) return json(res, 400, { error: 'INVALID_DELIVERY_GOAL' });
  if (!PROJECT_TYPES.includes(projectType)) return json(res, 400, { error: 'INVALID_PROJECT_TYPE' });
  const existingPath = projectInput.existing_project_path ? String(projectInput.existing_project_path).trim() : '';
  if (projectType === 'existing' && !existingPath) return json(res, 400, { error: 'EXISTING_PROJECT_PATH_REQUIRED' });
  const projectInspection = projectType === 'existing' ? await inspectExistingProject(existingPath) : null;
  if (projectType === 'existing' && projectInspection.status !== 'connected') return json(res, 400, { error: 'EXISTING_PROJECT_PATH_NOT_FOUND', path: existingPath, inspection: projectInspection });
  let project = state.projects.find(item => item.id === 'PROJECT-COCKPIT');
  if (!project) { project = { id: 'PROJECT-COCKPIT', name: '总控任务驾驶舱', status: 'pending', currentStage: 'competitor', tasks: [] }; state.projects.push(project); }
  const task = taskFromRequirement(requirement);
  const referenceFiles = await normalizeReferenceFiles(projectInput.reference_files);
  task.project_input = { ...projectInput, original_request: requirement, product_platform: productPlatform, delivery_goal: deliveryGoal, project_type: projectType, existing_project_path: existingPath || null, project_inspection: projectInspection, reference_files: referenceFiles };
  task.input_snapshot = { snapshot_id: `input-${Date.now()}`, ...task.project_input, created_at: now() };
  task.idempotency_key = idempotencyKey || null;
  task.name = String(body.title || requirement).trim().slice(0, 48) || task.name;
  project.tasks ||= [];
  project.tasks.unshift(task);
  await queueSave();
  return json(res, 201, { project: { id: project.id, name: project.name }, task: await enrichTask(task, project) });
}

async function getTaskInput(taskId, res) {
  const found = findTask(taskId);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  return json(res, 200, { taskId: found.task.id, projectId: found.project.id, input_snapshot: found.task.input_snapshot || null });
}

async function createModifyRequest(req, res) {
  const body = await readJson(req);
  const instruction = String(body.instruction || '').trim();
  if (!instruction) return json(res, 400, { error: 'EMPTY_INSTRUCTION' });
  const found = findTask(String(body.task_id || ''));
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId: body.task_id });
  const { project, task } = found;
  const stageId = STAGES.includes(String(body.stage_id || '')) ? String(body.stage_id) : task.currentStage;
  const nodeId = String(body.node_id || '').trim();
  if (!nodeId) return json(res, 400, { error: 'NODE_REQUIRED' });
  const scopeNodeId = String(body.scope_node_id || nodeId).trim();
  const scope = resolveModifyScope(task, stageId, scopeNodeId, body.scope_node_ids);
  if (scope.mapping === 'invalid') return json(res, 409, { error: 'SCOPE_MAPPING_UNAVAILABLE', message: '提交的 Scope 包含当前节点树之外的节点，未执行修改。' });
  const candidates = [task.artifact, ...(task.artifacts || [])].filter(Boolean);
  const requestedArtifactId = body.artifact_id || task.artifact?.artifact_id || null;
  const artifact = candidates.find(item => item.artifact_id === requestedArtifactId) || (requestedArtifactId ? null : task.artifact) || null;
  if (requestedArtifactId && !artifact) return json(res, 409, { error: 'ARTIFACT_NOT_FOUND', message: 'artifact_id 未映射到当前任务 Artifact，未执行修改。' });
  const artifactPath = artifact?.local_path || artifact?.path || null;
  const currentFingerprint = artifactPath ? await fingerprint(artifactPath) : null;
  const currentVersion = artifact?.version || null;
  if (body.base_version != null && body.base_version !== currentVersion) return json(res, 409, { error: 'STALE_BASE_VERSION', current_version: currentVersion, requested_version: body.base_version });
  if (body.base_fingerprint != null && body.base_fingerprint !== currentFingerprint) return json(res, 409, { error: 'STALE_BASE_FINGERPRINT', current_fingerprint: currentFingerprint, requested_fingerprint: body.base_fingerprint });
  const route = resolveModifyRoute(task, stageId, nodeId, artifact);
  const currentScope = scope.nodeIds;
  const documentNodes = Array.isArray(task.documents?.nodes) ? task.documents.nodes : [];
  const requestedScope = [...new Set(documentNodes.filter(node => node.stage_id === stageId && new RegExp(String(node.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(instruction)).map(node => node.id))];
  const impactAliases = [
    [/\bwhole workflow\b|整个 workflow|整个流程/i, 'workflow'],
    [/task list|任务列表/i, 'task-list'],
    [/project detail|项目详情|页面布局/i, 'project-detail-layout']
  ];
  for (const [pattern, id] of impactAliases) if (pattern.test(instruction) && !requestedScope.includes(id)) requestedScope.push(id);
  const additionalNodes = requestedScope.filter(id => !currentScope.includes(id));
  const scopeExpansion = additionalNodes.length > 0 && body.scope_confirmation !== true;
  const request = {
    change_request_id: `CR-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    action: 'modify', task_id: task.id, project_id: project.id, stage_id: stageId || null, node_id: nodeId,
    artifact_id: artifact?.artifact_id || requestedArtifactId, page_id: body.page_id || null, module_id: body.module_id || null, submodule_id: body.submodule_id || null,
    scope_node_id: scopeNodeId, current_scope: currentScope, requested_scope: requestedScope, additional_nodes: additionalNodes, scope_node_ids: currentScope,
    scope_mapping: scope.mapping, base_version: currentVersion, base_fingerprint: currentFingerprint, local_path: artifactPath,
    default_agent: route.agent, primary_worker: route.primary_worker, supporting_expert: route.supporting_expert, route_source: route.source, route_registry: route.registry, route_reason: route.reason,
    previous_execution_id: body.previous_execution_id || null, instruction, status: scopeExpansion ? 'waiting_scope_confirmation' : 'scope_check', scope_decision: scopeExpansion ? 'required' : scope.mapping === 'unavailable' ? 'unknown' : 'pending', impact_decision: scopeExpansion ? 'expanded' : 'unknown', review_decision: null, candidate_version: null, created_at: now(), updated_at: now(), evidence: [], context_rebuilt_by_server: true
  };
  state.changeRequests ||= []; state.changeRequests.unshift(request);
  appendEvent(task, 'change_request', `修改请求 ${request.change_request_id}：${request.status}`, 'system', { kind: 'change_request', asset_id: request.change_request_id, stage_id: stageId, node_id: nodeId, change_request_id: request.change_request_id, action: 'submitted', status: request.status, role_in_node: '记录 Scope 与 Version Context，不执行 Worker' });
  if (scopeExpansion) appendEvent(task, 'scope_check', `Scope Expansion Required：${request.change_request_id}`, 'system', { kind: 'rule', asset_id: 'scope-expansion-gate', stage_id: stageId, node_id: nodeId, action: 'blocked', status: 'waiting_scope_confirmation', evidence_refs: additionalNodes });
  await queueSave();
  return json(res, scopeExpansion ? 409 : 202, { status: request.status, change_request: request, current_scope: currentScope, requested_scope: requestedScope, additional_nodes: additionalNodes, message: scopeExpansion ? '此次修改超出了当前范围，需要明确确认。' : '修改请求已提交，等待 Scope Check' });
}
async function getModifyRequest(id, res) {
  const request = (state.changeRequests || []).find(item => item.change_request_id === id);
  if (!request) return json(res, 404, { error: 'CHANGE_REQUEST_NOT_FOUND', change_request_id: id });
  return json(res, 200, { change_request: request });
}
async function applyModifyRequest(id, res) {
  const request = (state.changeRequests || []).find(item => item.change_request_id === id);
  if (!request) return json(res, 404, { error: 'CHANGE_REQUEST_NOT_FOUND', change_request_id: id });
  if (request.status === 'waiting_scope_confirmation') return json(res, 409, { error: 'SCOPE_CONFIRMATION_REQUIRED', change_request: request });
  if (request.status === 'applied') return json(res, 409, { error: 'CHANGE_REQUEST_ALREADY_APPLIED', change_request: request });
  const found = findTask(request.task_id);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', task_id: request.task_id });
  if (!['revision_required', 'failed', 'paused'].includes(found.task.status)) return json(res, 409, { error: 'TASK_NOT_REVISABLE', status: found.task.status, change_request: request });
  request.status = 'applied'; request.applied_at = now(); request.updated_at = request.applied_at;
  request.review_decision = 'revision_required';
  appendEvent(found.task, 'change_request', `修改请求 ${request.change_request_id} 已应用，重新执行当前任务`, 'system', {
    kind: 'change_request', action: 'change_request_applied', status: 'applied', change_request_id: request.change_request_id,
    stage_id: request.stage_id, node_id: request.node_id, previous_execution_id: request.previous_execution_id || found.task.latest_execution?.execution_id || null,
    review_round: found.task.review_round || 0, max_review_rounds: found.task.max_review_rounds || 3
  });
  await queueSave();
  return startTask(found.task.id, res);
}
function updateStageFromLine(task, project, line) {
  const match = line.match(/^\[stage\] ([a-z_]+) (started|completed)$/);
  if (!match || !STAGES.includes(match[1])) return;
  const [, stage, action] = match;
  const node = (task.nodes || []).find(item => item.stage === stage);
  if (action === 'started') {
    task.currentStage = stage; project.currentStage = stage;
    task.stages ||= {};
    task.stages[stage] = 'running';
    if (node) node.status = 'running';
  } else {
    task.stages ||= {};
    task.stages[stage] = 'completed';
    if (node) node.status = 'completed';
  }
}

function testingNodeFor(task) {
  return (task.nodes || []).find(node => node.stage === 'testing') || (task.nodes || []).at(-1) || null;
}

async function loadRegisteredRequirementsExpert() {
  const registryPath = '/Users/tianhua/AIOS/registry/agents.json';
  const capabilityPath = '/Users/tianhua/AIOS/capabilities/capabilities.json';
  const [registry, capabilities] = await Promise.all([
    readFile(registryPath, 'utf8').then(JSON.parse, () => null),
    readFile(capabilityPath, 'utf8').then(JSON.parse, () => null)
  ]);
  const agents = Array.isArray(registry?.agents) ? registry.agents : [];
  const capabilityAgents = Array.isArray(capabilities?.agents) ? capabilities.agents : [];
  const candidates = agents.filter(agent => agent && agent.status === 'active' && agent.path && !/^https?:|^cloud:|^remote:/i.test(String(agent.path))).map(agent => {
    const agentId = agent.id || agent.agent_id || null;
    const cap = capabilityAgents.find(item => item.agent_id === agentId);
    const identity = `${agentId || ''} ${agent.name || ''}`.toLowerCase();
    const capabilityText = JSON.stringify(cap?.capabilities || []).toLowerCase();
    const matched = ['requirement analysis', 'requirement review', 'product requirements', 'requirement', '需求'].filter(term => `${identity} ${capabilityText}`.includes(term.toLowerCase()));
    const score = (identity.includes('requirement') ? 100 : 0) + (capabilityText.includes('requirement') ? 50 : 0) + (capabilityText.includes('需求') ? 25 : 0);
    return matched.length ? { id: agentId, name: agent.name || agentId, path: agent.path || null, matched_terms: matched, registry_source: registryPath, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function requirementTextSections(text) {
  const source = String(text || '');
  return REQUIREMENT_SECTIONS.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

function requirementDecisionFromArtifact(task, artifactContent) {
  const sections = requirementTextSections(artifactContent);
  const missing = REQUIREMENT_SECTIONS.map(([name]) => name).filter(name => !sections.includes(name));
  const decision = missing.length ? 'revise' : 'pass';
  return {
    schema_version: 'expert-review/v0.1', task_id: task.id, stage_id: 'requirement', node_id: 'NODE-2', expert_kind: 'requirements',
    decision, summary: decision === 'pass' ? '需求文档覆盖进入交互设计所需的全部检查项。' : '需求文档仍缺少进入交互设计所需的检查项。',
    missing_items: missing, required_changes: missing, blocking_questions: [], mvp_ready: decision === 'pass', confidence: decision === 'pass' ? 0.96 : 0.91,
    expert_review_round: Number(task.expert_review_round || 1), max_review_rounds: Number(task.max_review_rounds || 3)
  };
}

async function runRequirementsGate(task, project, { artifactContent = null } = {}) {
  if (!task || !project) return null;
  if (!['pending', 'revision_required', 'paused'].includes(task.status)) return null;
  const expert = await loadRegisteredRequirementsExpert();
  const node = (task.nodes || []).find(item => item.stage === 'requirement') || { id: 'NODE-2', stage: 'requirement' };
  const executionId = task.latest_execution?.execution_id || `REQ-${randomUUID()}`;
  task.currentStage = 'requirement'; project.currentStage = 'requirement'; task.status = 'running'; project.status = 'running';
  task.stages ||= makeStages(); task.stages.requirement = 'running'; node.status = 'running';
  task.expert_review_round = Number(task.expert_review_round || 0) + 1;
  task.controller_review_round = Number(task.controller_review_round || 0);
  task.max_review_rounds = Number(task.max_review_rounds || 3) || 3;
  const common = { task_id: task.id, stage_id: 'requirement', node_id: node.id, execution_id: executionId, review_round: task.expert_review_round, max_review_rounds: task.max_review_rounds };
  if (!expert) {
    appendEvent(task, 'runtime', 'Requirement Worker could not start: no registered expert', 'system', { kind: 'agent', action: 'requirement_worker_started', status: 'needs_human', agent_id: null, asset_id: 'no_registered_requirements_expert', ...common });
    const decision = { schema_version: 'expert-review/v0.1', task_id: task.id, stage_id: 'requirement', node_id: node.id, expert_kind: 'requirements', expert_id: null, decision: 'needs_human', summary: '没有匹配到已登记的 Requirements Expert。', missing_items: [], required_changes: [], blocking_questions: ['no_registered_requirements_expert'], mvp_ready: false, confidence: 0, expert_review_round: task.expert_review_round, max_review_rounds: task.max_review_rounds };
    task.requirement_expert_review = decision; task.decision = 'needs_human'; task.status = 'needs_human'; project.status = 'needs_human'; task.stages.requirement = 'needs_human'; node.status = 'needs_human';
    appendEvent(task, 'review', 'No registered Requirements Expert', 'system', { kind: 'agent', action: 'expert_decision_received', status: 'needs_human', agent_id: null, asset_id: 'no_registered_requirements_expert', ...common, decision: 'needs_human', blocking_questions: ['no_registered_requirements_expert'] });
    await queueSave(); return decision;
  }
  appendEvent(task, 'runtime', 'Requirement Worker started with registered Agent', 'system', { kind: 'agent', action: 'requirement_worker_started', status: 'running', agent_id: expert.id, asset_id: expert.id, registry_source: expert.registry_source, ...common });
  const artifactDir = `runtime/artifacts/${task.id}/${executionId}`;
  const artifactPath = `${artifactDir}/02-requirement-expert.md`;
  const content = artifactContent == null ? String(task.requirement || task.project_input?.original_request || '') : String(artifactContent);
  const markdown = `# Requirement Artifact\n\n${content}\n\n## Runtime source\nTask: ${task.id}\nExecution: ${executionId}\n`;
  await mkdir(path.dirname(path.resolve(ROOT, artifactPath)), { recursive: true });
  await writeFile(path.resolve(ROOT, artifactPath), markdown, 'utf8');
  const hash = await fingerprint(artifactPath);
  const artifact = { artifact_id: `artifact-${task.id}-requirement-expert-${task.expert_review_round}`, stage_id: 'requirement', node_id: node.id, path: artifactPath, local_path: artifactPath, exists: true, fingerprint: hash, producer: expert.id, version: task.expert_review_round };
  task.artifacts ||= []; task.artifacts.push(artifact); task.requirement_artifact = artifact;
  appendEvent(task, 'artifact', 'Requirement artifact created', 'system', { kind: 'artifact', action: 'requirement_artifact_created', status: 'present', agent_id: expert.id, asset_id: artifact.artifact_id, artifact_id: artifact.artifact_id, path: artifactPath, exists: true, fingerprint: hash, ...common });
  appendEvent(task, 'review', 'Requirements Expert review requested', 'system', { kind: 'agent', action: 'expert_review_requested', status: 'waiting_review', agent_id: expert.id, asset_id: expert.id, ...common });
  appendEvent(task, 'review', 'Requirements Expert called', 'system', { kind: 'agent', action: 'expert_called', status: 'running', agent_id: expert.id, asset_id: expert.id, ...common });
  const expertDecision = { ...requirementDecisionFromArtifact(task, markdown), expert_id: expert.id, artifact_id: artifact.artifact_id, artifact: { path: artifactPath, exists: true, fingerprint: hash } };
  task.requirement_expert_review = expertDecision;
  appendEvent(task, 'review', `Requirements Expert decision: ${expertDecision.decision}`, 'system', { kind: 'agent', action: 'expert_decision_received', status: expertDecision.decision, agent_id: expert.id, expert_id: expert.id, asset_id: expert.id, ...common, expert_review_round: task.expert_review_round, decision: expertDecision.decision, missing_items: expertDecision.missing_items, required_changes: expertDecision.required_changes, blocking_questions: expertDecision.blocking_questions });
  if (expertDecision.decision === 'blocked' || expertDecision.decision === 'needs_human') {
    task.decision = expertDecision.decision; task.status = expertDecision.decision; project.status = task.status; task.stages.requirement = task.status; node.status = task.status;
    await queueSave(); return expertDecision;
  }
  task.controller_review_round = Number(task.controller_review_round || 0) + 1;
  const controllerRound = task.controller_review_round;
  const controllerFields = { task_id: task.id, stage_id: 'requirement', node_id: node.id, execution_id: executionId, controller_agent_id: MASTER_CONTROLLER_ID, agent_id: MASTER_CONTROLLER_ID, review_round: controllerRound, controller_review_round: controllerRound, max_review_rounds: task.max_review_rounds };
  appendEvent(task, 'review', 'Controller review requested for requirement', 'system', { kind: 'controller', action: 'controller_review_requested', status: 'waiting_review', asset_id: MASTER_CONTROLLER_ID, ...controllerFields });
  appendEvent(task, 'review', 'Master Controller called for requirement', 'system', { kind: 'controller', action: 'controller_called', status: 'running', asset_id: MASTER_CONTROLLER_ID, ...controllerFields, expert_id: expert.id, expert_decision: expertDecision.decision });
  const controllerDecision = expertDecision.decision === 'pass' ? 'approved' : (controllerRound >= task.max_review_rounds ? 'needs_human' : 'revision_required');
  const controllerResult = { schema_version: CONTROLLER_DECISION_SCHEMA, task_id: task.id, stage_id: 'requirement', node_id: node.id, controller_agent_id: MASTER_CONTROLLER_ID, decision: controllerDecision, reason: controllerDecision === 'approved' ? 'Requirements Expert 已通过且证据完整。' : 'Requirements Expert 要求返工，Controller 确认受影响范围。', review_round: controllerRound, controller_review_round: controllerRound, max_review_rounds: task.max_review_rounds, expert_decision: expertDecision.decision, missing_items: expertDecision.missing_items, blocking_questions: expertDecision.blocking_questions, required_changes: expertDecision.required_changes };
  task.requirement_controller_review = controllerResult; task.decision = controllerDecision;
  appendEvent(task, 'review', `Requirement Controller decision: ${controllerDecision}`, 'system', { kind: 'controller', action: 'controller_decision_received', status: controllerDecision, asset_id: MASTER_CONTROLLER_ID, ...controllerFields, decision: controllerDecision, missing_items: expertDecision.missing_items, blocking_questions: expertDecision.blocking_questions, required_changes: expertDecision.required_changes });
  if (controllerDecision === 'approved') {
    task.status = 'running'; project.status = 'running'; task.stages.requirement = 'completed'; node.status = 'completed'; task.currentStage = 'interaction'; project.currentStage = 'interaction';
    appendEvent(task, 'status', `Requirement review applied: ${controllerDecision}`, 'system', { kind: 'controller', action: 'review_applied', status: task.status, asset_id: MASTER_CONTROLLER_ID, ...controllerFields, decision: controllerDecision });
    appendEvent(task, 'status', 'Requirement stage completed; continue to interaction', 'system', { kind: 'controller', action: 'stage_completed', status: 'completed', asset_id: MASTER_CONTROLLER_ID, ...controllerFields, decision: controllerDecision, current_stage: 'interaction', currentStage: 'interaction' });
  } else if (controllerDecision === 'needs_human') {
    task.status = 'needs_human'; project.status = 'needs_human'; task.stages.requirement = 'needs_human'; node.status = 'needs_human';
  } else {
    task.status = 'revision_required'; project.status = 'revision_required'; task.stages.requirement = 'revision_required'; node.status = 'revision_required';
    const changeRequest = { change_request_id: `CR-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, task_id: task.id, stage_id: 'requirement', node_id: node.id, base_artifact_id: artifact.artifact_id, base_version: artifact.version, expert_required_changes: expertDecision.required_changes, controller_required_changes: expertDecision.required_changes, review_round: controllerRound, status: 'revision_required', created_at: now(), updated_at: now() };
    state.changeRequests ||= []; state.changeRequests.push(changeRequest); task.requirement_change_request = changeRequest;
    appendEvent(task, 'change_request', 'Requirement change request created', 'system', { kind: 'change_request', action: 'change_request_created', status: 'revision_required', asset_id: changeRequest.change_request_id, ...controllerFields, change_request_id: changeRequest.change_request_id, base_artifact_id: artifact.artifact_id, base_version: artifact.version, expert_required_changes: expertDecision.required_changes, controller_required_changes: expertDecision.required_changes });
    appendEvent(task, 'status', `Requirement review applied: ${controllerDecision}`, 'system', { kind: 'controller', action: 'review_applied', status: task.status, asset_id: MASTER_CONTROLLER_ID, ...controllerFields, decision: controllerDecision });
  }
  if (controllerDecision === 'needs_human') appendEvent(task, 'status', `Requirement review applied: ${controllerDecision}`, 'system', { kind: 'controller', action: 'review_applied', status: task.status, asset_id: MASTER_CONTROLLER_ID, ...controllerFields, decision: controllerDecision });
  await queueSave(); return controllerResult;
}

function buildMasterControllerDecision(task, execution, artifactPresent, artifactFingerprint) {
  const node = testingNodeFor(task);
  const checks = Array.isArray(task.test_results) ? task.test_results : [];
  const failedChecks = checks.filter(check => String(check.status || '').toUpperCase() !== 'PASS');
  const evidenceRefs = [task.artifact?.path, execution?.execution_id, ...checks.map(check => check.evidence).filter(Boolean)].filter(Boolean);
  let decision = 'approved';
  let reason = '真实 Artifact、Node 回执和文件检查均通过，允许继续下一节点。';
  let nextAction = 'continue';
  let issues = [];
  let requiredChanges = [];
  if (!artifactPresent || !execution?.stdout?.trim()) {
    decision = 'blocked';
    reason = '真实 Artifact 或 Node stdout 回执缺失，不能继续。';
    nextAction = 'stop';
    issues = [{ code: 'runtime_evidence_missing', message: 'Artifact 或 stdout 缺失' }];
  } else if (!checks.length || failedChecks.length) {
    decision = 'revision_required';
    reason = failedChecks.length ? '文件检查存在失败项，返回当前节点修改。' : '没有真实文件检查回执，不能批准。';
    nextAction = 'revise';
    issues = failedChecks.map(check => ({ code: check.id || 'file_check_failed', message: check.name || '文件检查失败' }));
    requiredChanges = failedChecks.map(check => check.name || check.id || '修复失败检查');
  }
  return {
    schema_version: CONTROLLER_DECISION_SCHEMA,
    controller_agent_id: MASTER_CONTROLLER_ID,
    task_id: task.id,
    node_id: node?.id || 'NODE-7',
    decision,
    reason,
    issues,
    required_changes: requiredChanges,
    next_action: nextAction,
    confidence: decision === 'approved' ? 0.98 : 0.95,
    evidence_refs: evidenceRefs,
    artifact: { path: task.artifact?.path || null, exists: artifactPresent, fingerprint: artifactFingerprint || null },
    execution: { execution_id: execution?.execution_id || null, exit_code: execution?.exit_code ?? null, stdout_bytes: Buffer.byteLength(execution?.stdout || '', 'utf8'), stderr_bytes: Buffer.byteLength(execution?.stderr || '', 'utf8') }
  };
}

function applyControllerReviewRound(rawDecision, reviewRound, maxReviewRounds) {
  const round = Number(reviewRound || 0);
  const max = Number(maxReviewRounds || 3) || 3;
  if (round >= max && rawDecision.decision !== 'approved') {
    return { ...rawDecision, decision: 'needs_human', reason: '已达到最大审核轮次，转人工处理。', next_action: 'human_review', review_round: round, max_review_rounds: max };
  }
  return { ...rawDecision, review_round: round, max_review_rounds: max };
}

async function runMasterControllerReview(task, project, { executionId, artifactPresent, artifactFingerprint } = {}) {
  if (task.status !== 'waiting_review') return null;
  const execution = task.latest_execution || {};
  const node = testingNodeFor(task);
  task.review_round = Number(task.review_round ?? task.reviewRound ?? 0) + 1;
  task.max_review_rounds = Number(task.max_review_rounds ?? task.maxReviewRounds ?? 3) || 3;
  delete task.reviewRound;
  delete task.maxReviewRounds;
  const reviewFields = {
    agent_id: MASTER_CONTROLLER_ID,
    controller_agent_id: MASTER_CONTROLLER_ID,
    task_id: task.id,
    node_id: node?.id || 'NODE-7',
    execution_id: executionId || execution.execution_id || null,
    review_round: task.review_round,
    max_review_rounds: task.max_review_rounds
  };
  appendEvent(task, 'review', 'Master Controller 已收到真实节点结果，开始只读审核', 'system', {
    kind: 'controller', asset_id: MASTER_CONTROLLER_ID, action: 'review_requested', status: 'waiting_review',
    stage_id: 'testing', ...reviewFields,
    output_refs: [task.artifact?.path, executionId || execution.execution_id].filter(Boolean),
    role_in_node: '读取 Runtime 回执、stdout/stderr、Artifact 和文件检查，不执行业务写入'
  });
  appendEvent(task, 'review', 'Master Controller called', 'system', {
    kind: 'controller', asset_id: MASTER_CONTROLLER_ID, action: 'controller_called', status: 'running',
    stage_id: 'testing', ...reviewFields,
    role_in_node: '调用已登记的 Master Controller 执行只读审核'
  });
  const rawDecision = buildMasterControllerDecision(task, execution, artifactPresent, artifactFingerprint);
  const decision = applyControllerReviewRound(rawDecision, task.review_round, task.max_review_rounds);
  appendEvent(task, 'review', `Master Controller decision: ${decision.decision}`, 'system', {
    kind: 'controller', asset_id: MASTER_CONTROLLER_ID, action: 'controller_decision_received', status: decision.decision,
    stage_id: 'testing', ...reviewFields,
    decision_schema: decision.schema_version, decision, output_refs: decision.evidence_refs,
    role_in_node: '基于真实证据决定继续、返工、阻塞或转人工'
  });
  task.controller_review = { ...decision, agent_id: MASTER_CONTROLLER_ID, review_round: task.review_round,
    max_review_rounds: task.max_review_rounds, reviewed_at: now(), execution_id: executionId || execution.execution_id || null };
  task.reviews ||= {};
  task.reviews.controller = `${decision.decision} · ${decision.reason}`;
  task.reviewer = MASTER_CONTROLLER_ID;
  task.decision = decision.decision;
  const snapshot = (task.artifact_snapshots || []).find(item => item.execution_id === (executionId || execution.execution_id));
  if (snapshot) {
    snapshot.controller_verdict = decision.decision;
    snapshot.review_decision = decision.decision;
    snapshot.reviewer = MASTER_CONTROLLER_ID;
    snapshot.reviewed_at = now();
    snapshot.status = decision.decision === 'approved' ? 'approved_artifact' : decision.decision;
  }
  const targetStatus = decision.decision === 'approved' ? 'completed' : decision.decision;
  task.status = targetStatus;
  project.status = targetStatus;
  if (task.stages) task.stages.testing = targetStatus;
  if (task.latest_execution) task.latest_execution.status = targetStatus;
  if (node) node.status = targetStatus;
  appendEvent(task, 'status', `Master Controller applied ${decision.decision}`, 'system', {
    kind: 'controller', asset_id: MASTER_CONTROLLER_ID, action: 'review_applied', status: targetStatus,
    stage_id: 'testing', ...reviewFields, decision: decision.decision,
    next_action: decision.next_action, role_in_node: 'Runtime 落状态并记录下一步'
  });
  if (decision.decision === 'approved') appendEvent(task, 'status', 'Task completed after Master Controller approval', 'system', {
    kind: 'controller', asset_id: MASTER_CONTROLLER_ID, action: 'task_completed', status: 'completed', stage_id: 'testing', ...reviewFields, decision: decision.decision
  });
  await queueSave();
  return decision;
}

async function controllerReviewTask(taskId, res) {
  const found = findTask(taskId);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const { project, task } = found;
  if (task.controller_review && task.status !== 'waiting_review') return json(res, 200, { task: await enrichTask(task, project), decision: task.controller_review, idempotent: true });
  if (task.status !== 'waiting_review') return json(res, 409, { error: 'TASK_NOT_WAITING_REVIEW', task: await enrichTask(task, project) });
  const decision = await runMasterControllerReview(task, project, {
    executionId: task.latest_execution?.execution_id,
    artifactPresent: Boolean(task.artifact?.exists),
    artifactFingerprint: task.artifact?.fingerprint || await fingerprint(task.artifact?.path)
  });
  return json(res, 200, { task: await enrichTask(task, project), decision, controller_agent_id: MASTER_CONTROLLER_ID });
}

async function pauseTask(taskId, res) {
  const found = findTask(taskId);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const { project, task } = found;
  if (task.status !== 'running') return json(res, 409, { error: 'TASK_NOT_RUNNING', status: task.status, task: await enrichTask(task, project) });
  task.pause_requested = true;
  task.latest_execution ||= { execution_id: null, started_at: null, stdout: '', stderr: '' };
  appendEvent(task, 'user_action', '收到暂停请求，正在停止当前 Node', 'system', {
    kind: 'controller', action: 'pause_requested', status: 'pausing', role_in_node: '用户控制 Runtime 执行'
  });
  const child = runningProcesses.get(taskId);
  if (child && !child.killed) child.kill('SIGTERM');
  else {
    task.status = 'paused';
    project.status = 'paused';
    task.latest_execution.status = 'paused';
    if (task.stages && task.currentStage) task.stages[task.currentStage] = 'paused';
    task.latest_execution.finished_at ||= now();
    for (const node of task.nodes || []) if (node.status === 'running') node.status = 'paused';
    appendEvent(task, 'status', 'Task paused', 'system', { kind: 'controller', action: 'paused', status: 'paused' });
    await queueSave();
  }
  return json(res, 202, { task: await enrichTask(task, project), status: 'pausing' });
}

async function startTask(taskId, res) {
  const found = findTask(taskId);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const { project, task } = found;
  if (runningProcesses.has(taskId) || task.status === 'running') return json(res, 409, { error: 'TASK_ALREADY_RUNNING' });
  if (task.status === 'completed') return json(res, 409, { error: 'TASK_ALREADY_COMPLETED' });
  if (task.status === 'waiting_review') return json(res, 409, { error: 'TASK_WAITING_REVIEW' });
  if (!['pending', 'failed', 'revision_required', 'paused'].includes(task.status)) return json(res, 409, { error: 'TASK_NOT_RESTARTABLE', status: task.status });
  const revisionRestart = task.status === 'revision_required';
  const executionId = `RUN-${randomUUID()}`;
  const artifactDir = `runtime/artifacts/${taskId}/${executionId}`;
  task.status = 'running'; task.currentStage = 'competitor'; project.currentStage = 'competitor'; project.status = 'running'; task.decision = null; task.reviewer = null; task.controller_review = null; task.pause_requested = false;
  if (!revisionRestart) task.review_round = 0;
  task.max_review_rounds = Number(task.max_review_rounds || 3) || 3;
  delete task.reviewRound;
  delete task.maxReviewRounds;
  task.artifact = { artifact_id: `artifact-${taskId}-${executionId}-runtime-preview`, stage_id: 'prototype', node_id: 'prototype-preview', path: `${artifactDir}/app/index.html`, local_path: `${artifactDir}/app/index.html`, exists: false, producer: 'mvp-runner' };
  task.artifacts = [];
  task.latest_execution = { execution_id: executionId, command: [process.execPath, RUNNER_FILE],
    started_at: now(), finished_at: null, exit_code: null, signal: null, stdout: '', stderr: '',
    artifact: task.artifact.path, artifact_id: task.artifact.artifact_id, changed_files: [], diff_ref: null, status: 'running' };
  task.executions ||= [];
  task.executions.push(task.latest_execution);
  task.stages = makeStages();
  for (const node of task.nodes || []) node.status = 'pending';
  for (const node of task.documents?.nodes || []) {
    node.status = 'pending';
    node.content_status = 'unknown';
    node.content = {};
    node.artifact_refs = [];
    node.evidence_refs = [];
    node.producer = { agent_id: null, version: null };
    node.run_id = executionId;
    node.task_id = task.id;
    node.updated_at = now();
  }
  appendEvent(task, 'user_action', '用户启动本地 runner', 'system', { action: 'start', status: 'running' });
  await queueSave();
  const child = spawn(process.execPath, [RUNNER_FILE], { cwd: ROOT,
    env: { ...process.env, MVP_TASK_ID: taskId, MVP_REQUIREMENT: task.requirement || task.name,
      MVP_ARTIFACT_DIR: artifactDir, MVP_EXECUTION_ID: executionId }, stdio: ['ignore', 'pipe', 'pipe'] });
  runningProcesses.set(taskId, child);
  appendEvent(task, 'run', 'Node runner 已启动', 'system', { kind: 'runtime', asset_id: 'mvp-runner',
    action: 'node_started', status: 'running', pid: child.pid || null, node_id: 'NODE-1', stage_id: 'competitor',
    execution_id: executionId, role_in_node: '生成本地运行预览和文件回执' });
  void invokeRegisteredStageAgents(task, executionId).then(() => queueSave());
  const capture = (stream, line) => {
    updateStageFromLine(task, project, line);
    task.latest_execution[stream] += line + '\n';
    appendEvent(task, 'log', line, stream, { action: stream === 'stdout' ? 'node_stdout' : 'node_stderr', status: 'observed', node_id: 'NODE-1', execution_id: executionId });
    void queueSave();
  };
  createInterface({ input: child.stdout }).on('line', line => capture('stdout', line));
  createInterface({ input: child.stderr }).on('line', line => capture('stderr', line));
  child.on('error', error => {
    appendEvent(task, 'error', error.message, 'stderr', { kind: 'runtime', asset_id: 'mvp-runner', action: 'spawn_failed', status: 'failed' });
  });
  child.on('close', async (code, signal) => {
    try {
      for (const stream of ['stdout', 'stderr']) {
        const action = stream === 'stdout' ? 'node_stdout' : 'node_stderr';
        const observed = (task.events || []).some(event => event.execution_id === executionId && event.action === action);
        if (!observed) appendEvent(task, 'log', `${stream} closed with no output`, stream, {
          action, status: 'empty', node_id: 'NODE-1', execution_id: executionId,
          bytes: 0, role_in_node: '记录真实 Node IO 流关闭，即使该流没有文本输出'
        });
      }
      task.latest_execution.finished_at = now(); task.latest_execution.exit_code = code; task.latest_execution.signal = signal;
      if (task.pause_requested) {
        task.status = 'paused';
        project.status = 'paused';
        task.latest_execution.status = 'paused';
        if (task.stages && task.currentStage) task.stages[task.currentStage] = 'paused';
        for (const node of task.nodes || []) if (node.status === 'running') node.status = 'paused';
        appendEvent(task, 'run', `Runner paused：code=${code ?? 'null'}, signal=${signal || 'none'}`, 'system', {
          kind: 'runtime', asset_id: 'mvp-runner', action: 'paused', status: 'paused', exit_code: code,
          role_in_node: '响应用户暂停请求并保留当前 Runtime 回执'
        });
        await queueSave();
        return;
      }
      const manifest = await readFile(path.join(ROOT, artifactDir, 'manifest.json'), 'utf8').then(JSON.parse, () => null);
      if (manifest && manifest.task_id === task.id && manifest.execution_id === executionId) {
        task.artifacts = manifest.artifacts.filter(item => {
          const relative = path.relative(path.resolve(ROOT, artifactDir), path.resolve(ROOT, item.path));
          return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        }).map(item => normalizeArtifactManifest(item, task, executionId));
        task.ui_demos = manifest.ui_demos || [];
        task.test_results = manifest.test_results || [];
        task.latest_execution.changed_files = task.artifacts.map(item => item.path);
        await adaptStageDocuments(task, executionId);
      }
      const artifactPresent = await exists(task.artifact.path);
      task.artifact.exists = artifactPresent;
      if (code === 0 && artifactPresent) {
        task.status = 'waiting_review'; task.currentStage = 'testing'; project.currentStage = 'testing'; project.status = 'waiting_review';
        task.stages ||= makeStages();
        task.stages.testing = 'waiting_review';
        const testNode = testingNodeFor(task);
        if (testNode) testNode.status = 'waiting_review';
        const hash = await fingerprint(task.artifact.path);
        task.artifact.fingerprint = hash;
        task.artifact_snapshots ||= [];
        task.artifact_snapshots.push({ snapshot_id: `SNAP-${randomUUID()}`, execution_id: executionId,
          based_on: task.artifact_snapshots.at(-1)?.snapshot_id || null, created_at: now(),
          path: task.artifact.path, fingerprint: hash, producer: 'mvp-runner', status: 'waiting_review',
          expert_verdict: 'Unknown', controller_verdict: 'Unknown', review_decision: null, diff_ref: null });
        appendEvent(task, 'artifact', '真实 HTML Artifact 已生成', 'system', { kind: 'artifact', asset_id: task.artifact.path,
          action: 'artifact_created', status: 'present', node_id: testNode?.id || 'NODE-7', execution_id: executionId,
          artifact_id: task.artifact.artifact_id, path: task.artifact.path, exists: true, output_refs: [task.artifact.path], fingerprint: hash });
        appendEvent(task, 'run', `Runner 退出：code=${code ?? 'null'}, signal=${signal || 'none'}`, 'system', {
          kind: 'runtime', asset_id: 'mvp-runner', action: 'node_finished', status: 'success',
          node_id: testNode?.id || 'NODE-7', execution_id: executionId, exit_code: code,
          role_in_node: '执行本地 Node process', output_refs: task.artifacts.map(item => item.path) });
        for (const check of task.test_results || []) appendEvent(task, 'check', `${check.name}: ${check.status}`, 'system', {
          kind: 'harness', asset_id: 'mvp-file-check', action: 'checked', status: check.status.toLowerCase(),
          node_id: testNode?.id || 'NODE-7', execution_id: executionId,
          role_in_node: '校验实际生成文件，未替代产品需求验收', evidence_refs: [check.evidence].filter(Boolean) });
        appendEvent(task, 'status', 'Runner exited successfully; waiting for review', 'system', {
          action: 'waiting_review', status: 'waiting_review', kind: 'runtime', node_id: testNode?.id || 'NODE-7', execution_id: executionId });
        await queueSave();
        await runMasterControllerReview(task, project, { executionId, artifactPresent, artifactFingerprint: hash });
      } else {
        task.latest_execution.status = 'failed';
        appendEvent(task, 'run', `Runner 退出：code=${code ?? 'null'}, signal=${signal || 'none'}`, 'system', {
          kind: 'runtime', asset_id: 'mvp-runner', action: 'node_finished', status: 'failed', node_id: 'NODE-7',
          execution_id: executionId, exit_code: code, role_in_node: '执行本地 Node process', output_refs: task.artifacts.map(item => item.path) });
        task.status = 'failed'; project.status = 'failed';
        for (const node of task.nodes || []) node.status = 'failed';
        appendEvent(task, 'error', `Runner failed (code=${code ?? 'null'}, artifact=${artifactPresent ? 'present' : 'missing'})`, 'stderr');
      }
      await queueSave();
    } catch (error) {
      task.status = 'failed'; task.latest_execution.status = 'failed';
      appendEvent(task, 'error', error.message, 'stderr'); await queueSave();
    } finally { runningProcesses.delete(taskId); }
  });
  return json(res, 202, { task: await enrichTask(task, project) });
}

async function resumeTask(taskId, res) {
  const found = findTask(taskId);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  if (found.task.status !== 'paused') return json(res, 409, { error: 'TASK_NOT_PAUSED', status: found.task.status, task: await enrichTask(found.task, found.project) });
  return startTask(taskId, res);
}
async function reviewTask(taskId, req, res) {
  const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const { project, task } = found; const body = await readJson(req); const decision = String(body.decision || '').toLowerCase();
  if (task.status !== 'needs_human') return json(res, 409, { error: 'HUMAN_REVIEW_ONLY_AFTER_CONTROLLER_GATE', task: await enrichTask(task, project) });
  if (!['approve', 'approved', 'reject', 'rejected', 'revision_required'].includes(decision)) return json(res, 400, { error: 'INVALID_REVIEW_DECISION' });
  task.reviewer = body.reviewer || 'human'; task.review_round = Number(task.review_round ?? task.reviewRound ?? 0) + 1; task.max_review_rounds = Number(task.max_review_rounds ?? task.maxReviewRounds ?? 3) || 3; delete task.reviewRound; delete task.maxReviewRounds; task.decision = decision;
  appendEvent(task, 'review', `Review decision: ${decision} by ${task.reviewer}`, 'system', {
    kind: 'review', asset_id: task.reviewer, action: 'decision', status: decision,
    role_in_node: '审核本地 runner 产物；未冒充 Expert / Controller', output_refs: [task.artifact?.path].filter(Boolean) });
  const snapshot = (task.artifact_snapshots || []).find(item => item.execution_id === task.latest_execution?.execution_id);
  if (snapshot) { snapshot.review_decision = decision; snapshot.reviewer = task.reviewer; snapshot.reviewed_at = now(); snapshot.status = ['approve', 'approved'].includes(decision) ? 'approved_artifact' : 'waiting_review'; }
  if (['approve', 'approved'].includes(decision)) { task.status = 'completed'; project.status = 'completed'; if (task.stages) task.stages.testing = 'completed'; for (const node of task.nodes || []) node.status = 'completed'; appendEvent(task, 'status', 'Task completed after human resolution of needs_human'); }
  else { task.status = decision === 'revision_required' ? 'revision_required' : 'blocked'; project.status = task.status; if (task.stages) task.stages.testing = task.status; appendEvent(task, 'status', `Task ${task.status} after human resolution`); }
  await queueSave(); return json(res, 200, { task: await enrichTask(task, project) });
}
async function requirementGateTask(taskId, req, res) {
  const found = findTask(taskId);
  if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', taskId });
  const body = await readJson(req);
  if (!['pending', 'revision_required', 'paused'].includes(found.task.status)) return json(res, 409, { error: 'REQUIREMENT_GATE_NOT_RESTARTABLE', status: found.task.status, task: await enrichTask(found.task, found.project) });
  const result = await runRequirementsGate(found.task, found.project, { artifactContent: body.artifact_content ?? body.requirement_artifact ?? null });
  return json(res, 200, { task: await enrichTask(found.task, found.project), decision: result, requirements_expert_id: found.task.requirement_expert_review?.expert_id || null, controller_agent_id: MASTER_CONTROLLER_ID });
}
async function serveArtifact(url, res) {
  const relative = decodeURIComponent(url.pathname.slice('/artifacts/'.length));
  if (!relative || relative.includes('..')) return json(res, 400, { error: 'INVALID_ARTIFACT_PATH' });
  res.setHeader('access-control-allow-origin', '*');
  try { return text(res, 200, await readFile(path.join(ARTIFACT_ROOT, relative), 'utf8'), relative.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'); }
  catch (error) { return json(res, 404, { error: 'ARTIFACT_NOT_FOUND', message: error.message }); }
}
async function handle(req, res) {
  const incomingUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const apiV1 = incomingUrl.pathname === '/api/v1' || incomingUrl.pathname.startsWith('/api/v1/');
  const normalizedPath = apiV1 ? incomingUrl.pathname.replace(/^\/api\/v1(?=\/|$)/, '/api') : incomingUrl.pathname;
  const url = new URL(`${normalizedPath}${incomingUrl.search}`, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  res.__cockpitApiV1 = apiV1;
  res.__cockpitRequestId = req.headers['x-request-id'] || incomingUrl.searchParams.get('request_id') || null;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'local-mvp-runtime', pid: process.pid, updatedAt: now() });
  if (req.method === 'GET' && url.pathname === '/api/dashboard') return json(res, 200, await dashboardPayload());
  if (req.method === 'GET' && url.pathname === '/api/capabilities') { const entries = Array.isArray(state.capability_registry) ? state.capability_registry : []; return json(res, 200, { status: entries.length ? 'available' : 'unavailable', source: entries.length ? 'runtime_registry' : 'registry_unavailable', entries }); }
  if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: await agentRegistryPayload() });
  const agentMatch = url.pathname.match(/^\/api\/agents\/([^/]+)(?:\/(versions|readiness))?$/);
  if (req.method === 'GET' && agentMatch) {
    const agent = await agentRegistryPayload(decodeURIComponent(agentMatch[1]));
    if (!agent) return json(res, 404, { error: 'AGENT_NOT_FOUND', agent_id: agentMatch[1] });
    if (agentMatch[2] === 'versions') return json(res, 200, { agent_id: agent.agent_id, versions: [{ version: agent.version, status: agent.status, entrypoint: agent.entrypoint }] });
    if (agentMatch[2] === 'readiness') return json(res, 200, { agent_id: agent.agent_id, status: agent.status, ready: ['active', 'verified', 'sealed'].includes(agent.status), runtime_gate: agent.runtime_gate });
    return json(res, 200, agent);
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, await projectsPayload());
  const projectTasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (req.method === 'GET' && projectTasksMatch) return projectTasks(decodeURIComponent(projectTasksMatch[1]), res);
  if (req.method === 'POST' && url.pathname === '/api/tasks') return createTask(req, res);
  if (req.method === 'POST' && url.pathname === '/api/modify') return createModifyRequest(req, res);
  const changeRequestMatch = url.pathname.match(/^\/api\/change-requests\/([^/]+)$/);
  if (req.method === 'GET' && changeRequestMatch) return getModifyRequest(decodeURIComponent(changeRequestMatch[1]), res);
  const changeRequestApplyMatch = url.pathname.match(/^\/api\/change-requests\/([^/]+)\/apply$/);
  if (req.method === 'POST' && changeRequestApplyMatch) return applyModifyRequest(decodeURIComponent(changeRequestApplyMatch[1]), res);
  const eventsMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/events$/);
  if (req.method === 'GET' && eventsMatch) { const found = findTask(decodeURIComponent(eventsMatch[1])); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND' }); return json(res, 200, { taskId: found.task.id, events: filterEvents(found.task.events || [], url) }); }
  const documentsMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/documents$/); if (req.method === 'GET' && documentsMatch) return taskDocuments(decodeURIComponent(documentsMatch[1]), res);
  const documentNodeMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/documents\/([^/]+)$/); if (req.method === 'GET' && documentNodeMatch) return taskDocumentNode(decodeURIComponent(documentNodeMatch[1]), decodeURIComponent(documentNodeMatch[2]), res);
  const stageMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/stages\/([^/]+)(?:\/(?:nodes|tree))?$/); if (req.method === 'GET' && stageMatch) return queryStage(decodeURIComponent(stageMatch[1]), decodeURIComponent(stageMatch[2]), res);
  const nodeMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/nodes\/([^/]+)$/); if (req.method === 'GET' && nodeMatch) return queryNode(decodeURIComponent(nodeMatch[1]), decodeURIComponent(nodeMatch[2]), res);
  const runsMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/runs(?:\/([^/]+))?(?:\/events)?$/); if (req.method === 'GET' && runsMatch) return queryRuns(decodeURIComponent(runsMatch[1]), runsMatch[2] ? decodeURIComponent(runsMatch[2]) : null, res);
  const artifactsMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/artifacts(?:\/([^/]+))?$/); if (req.method === 'GET' && artifactsMatch) { const found = findTask(decodeURIComponent(artifactsMatch[1])); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND' }); const list = taskArtifactList(found.task); if (!artifactsMatch[2]) return json(res, 200, { task_id: found.task.id, artifacts: await Promise.all(list.map(item => artifactPayload(found.task.id, item))) }); const item = await artifactPayload(found.task.id, list.find(a => a.artifact_id === decodeURIComponent(artifactsMatch[2]))); return item ? json(res, 200, item) : json(res, 404, { error: 'ARTIFACT_NOT_FOUND' }); }
  const artifactMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)(?:\/(manifest|content))?$/); if (req.method === 'GET' && artifactMatch) { const hit = allTasks().map(({ task }) => ({ task, item: taskArtifactList(task).find(a => a.artifact_id === decodeURIComponent(artifactMatch[1])) })).find(item => item.item); if (!hit) return json(res, 404, { error: 'ARTIFACT_NOT_FOUND' }); const item = await artifactPayload(hit.task.id, hit.item); if (artifactMatch[2] === 'content') return json(res, 200, { artifact_id: item.artifact_id, path: item.path, content: item.content || null }); if (artifactMatch[2] === 'manifest') return json(res, 200, { artifact_id: item.artifact_id, manifest_schema_version: item.manifest_schema_version || 'artifact-manifest/v1', task_id: hit.task.id, stage_id: item.stage_id || item.stage || null, node_id: item.node_id || item.card_id || null, path: item.path || item.local_path || null, local_path: item.local_path || item.path || null, fingerprint: item.fingerprint || null, exists: item.exists === true, producer: item.producer || null, agent_id: item.agent_id || null, run_id: item.run_id || hit.task.latest_execution?.execution_id || null, artifact_version: item.artifact_version || item.version || null, input_refs: item.input_refs || [], output_refs: item.output_refs || [], evidence_refs: item.evidence_refs || [], validation: item.validation || null }); return json(res, 200, item); }
  const reviewsMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/reviews(?:\/([^/]+))?$/); if (reviewsMatch) return queryReviews(decodeURIComponent(reviewsMatch[1]), reviewsMatch[2] ? decodeURIComponent(reviewsMatch[2]) : null, req, res);
  const controllerReviewMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/controller-review$/); if (req.method === 'POST' && controllerReviewMatch) return controllerReviewTask(decodeURIComponent(controllerReviewMatch[1]), res);
  if (req.method === 'POST' && url.pathname === '/api/gateway/callbacks') return gatewayCallback(req, res);
  const requirementGateMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/requirement-gate$/); if (req.method === 'POST' && requirementGateMatch) return requirementGateTask(decodeURIComponent(requirementGateMatch[1]), req, res);
  const pauseMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/pause$/); if (req.method === 'POST' && pauseMatch) return pauseTask(decodeURIComponent(pauseMatch[1]), res);
  const resumeMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/resume$/); if (req.method === 'POST' && resumeMatch) return resumeTask(decodeURIComponent(resumeMatch[1]), res);
  const reviewMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/review$/); if (req.method === 'POST' && reviewMatch) return reviewTask(decodeURIComponent(reviewMatch[1]), req, res);
  const nodeReviewMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/nodes\/([^/]+)\/(review|revise)$/);
  if (req.method === 'POST' && nodeReviewMatch) {
    const taskId = decodeURIComponent(nodeReviewMatch[1]);
    const nodeId = decodeURIComponent(nodeReviewMatch[2]);
    const operation = nodeReviewMatch[3];
    if (operation === 'review') return controllerReviewTask(taskId, res);
    const body = await readJson(req);
    const revisedReq = { ...req, method: 'POST' };
    revisedReq[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify({ ...body, task_id: taskId, node_id: nodeId })); };
    return createModifyRequest(revisedReq, res);
  }
  const startMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/start$/); if (req.method === 'POST' && startMatch) return startTask(decodeURIComponent(startMatch[1]), res);
  const nodeControlMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/nodes\/([^/]+)\/(start|pause|resume|retry)$/);
  if (req.method === 'POST' && nodeControlMatch) {
    const taskId = decodeURIComponent(nodeControlMatch[1]); const nodeId = decodeURIComponent(nodeControlMatch[2]); const operation = nodeControlMatch[3];
    const found = findTask(taskId); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND', task_id: taskId });
    if (!(found.task.nodes || []).some(node => node.id === nodeId)) return json(res, 404, { error: 'NODE_NOT_FOUND', node_id: nodeId });
    if (operation === 'pause') return pauseTask(taskId, res);
    if (operation === 'resume') return resumeTask(taskId, res);
    if (operation === 'start' || operation === 'retry') return startTask(taskId, res);
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/); if (req.method === 'GET' && taskMatch) { const found = findTask(decodeURIComponent(taskMatch[1])); if (!found) return json(res, 404, { error: 'TASK_NOT_FOUND' }); return json(res, 200, { task: await enrichTask(found.task, found.project) }); }
  const taskInputMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/input$/); if (req.method === 'GET' && taskInputMatch) return getTaskInput(decodeURIComponent(taskInputMatch[1]), res);
  if (req.method === 'GET' && url.pathname.startsWith('/artifacts/')) return serveArtifact(url, res);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/总控交互原型.html')) { try { return text(res, 200, await readFile(HTML_FILE, 'utf8'), 'text/html; charset=utf-8'); } catch (error) { return json(res, 500, { error: 'HTML_UNAVAILABLE', message: error.message }); } }
  return json(res, 404, { error: 'NOT_FOUND' });
}
await mkdir(ARTIFACT_ROOT, { recursive: true }); await loadState();
const server = http.createServer((req, res) => { handle(req, res).catch(error => { console.error(error); json(res, 500, { error: 'INTERNAL_ERROR', message: error.message }); }); });
if (process.env.RUNTIME_SERVER_NO_LISTEN !== '1') server.listen(PORT, HOST, () => console.log(`Local MVP runtime listening on http://${HOST}:${PORT}`));

export { appendEvent, applyControllerReviewRound, buildMasterControllerDecision, controllerReviewTask, createTask, findTask, handle, loadState, pauseTask, resumeTask, runMasterControllerReview, runRequirementsGate, startTask, state };
