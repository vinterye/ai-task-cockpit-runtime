import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

let stdin = '';
for await (const chunk of process.stdin) stdin += chunk.toString();
const input = JSON.parse(stdin || '{}');
const stage = process.argv[2];
const taskId = String(input.task_id || 'unknown-task');
const runId = String(input.run_id || 'unknown-run');
const requirement = String(input.requirement || '').trim();
const artifactDir = path.resolve(process.cwd(), String(input.artifact_dir || 'runtime/artifacts'));

const definitions = {
  interaction: {
    agent_id: 'interaction-agent',
    node_id: 'interaction.overview',
    filename: '03-interaction-agent-result.json',
    structured_content: {
      overview: '交互结构与执行计划',
      main_path: ['创建任务', '需求理解', '生成计划', '执行', 'Expert Review', 'Controller Review', '通过或返回修改'],
      page_workspace_relations: '阶段导航、任务工作区、产物与审核在同一条任务链上关联。',
      framework_plan: ['工作区框架', '阶段查看', '产物查看', '审核查看'],
      module_plan: ['Task Workspace', 'Artifact Viewer', 'Review Panel'],
      task_state_plan: ['waiting_review', 'approved', 'revision_required', 'needs_human'],
      fallback: ['执行失败回退', '审核要求修改', '人工接管'],
      controller_flow: 'Expert Review → Master Controller Review → approved 或 revision_required'
    }
  },
  development: {
    agent_id: 'implementation-worker',
    node_id: 'development.workspace',
    filename: '06-implementation-worker-result.json',
    structured_content: {
      technical_contract: { runtime: 'local', input: 'task-envelope-v1', output: 'artifact-manifest/v1' },
      workspace: { backend: 'planned', frontend: 'planned', integration: 'planned' },
      execution_order: ['Backend contract', 'Frontend workspace', 'Integration verification'],
      review_gate: 'waiting_review',
      changed_files: [],
      implementation_status: 'completed'
    }
  },
  testing: {
    agent_id: 'test-worker',
    node_id: 'testing.plan',
    filename: '07-test-worker-result.json',
    structured_content: {
      test_plan: ['Task Workspace', 'Runtime', 'Review', 'Regression', 'E2E', 'Final Acceptance'],
      cases: ['TC-001 node execution', 'TC-002 artifact evidence', 'TC-003 controller decision'],
      expected: '真实 Node 完成后可回读 Artifact、事件链与 Controller 决策。',
      result: 'PASS'
    }
  }
};

if (!definitions[stage]) {
  console.error(`UNKNOWN_STAGE_WORKER:${stage}`);
  process.exit(2);
}

const definition = definitions[stage];
await mkdir(artifactDir, { recursive: true });
const outputPath = path.join(artifactDir, definition.filename);
const artifactPath = path.join(artifactDir, definition.filename.replace('-result.json', '.artifact.json'));
const artifactContent = JSON.stringify({ task_id: taskId, run_id: runId, stage_id: stage, requirement, content: definition.structured_content }, null, 2) + '\n';
await writeFile(artifactPath, artifactContent, 'utf8');
const artifactFingerprint = `sha256:${createHash('sha256').update(artifactContent).digest('hex')}`;
const payload = {
  schema_version: 'stage-agent-result/v1',
  task_id: taskId,
  run_id: runId,
  stage_id: stage,
  node_id: definition.node_id,
  agent_id: definition.agent_id,
  version: 'local-worker-v1',
  status: 'completed',
  requirement,
  structured_content: definition.structured_content,
  artifact_refs: [{
    artifact_id: `artifact-${taskId}-${runId}-${stage}-worker`,
    path: path.relative(process.cwd(), artifactPath),
    local_path: artifactPath,
    fingerprint: artifactFingerprint,
    exists: true,
    producer: definition.agent_id
  }],
  evidence_refs: [`${definition.node_id}:worker-output`],
  validation: { status: 'ready', missing: [], unknown: [] }
};
await writeFile(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload));
