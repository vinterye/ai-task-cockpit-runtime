import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(decodeURIComponent(new URL('..', import.meta.url).pathname));
const statePath = path.join(root, 'runtime', 'state.json');
const now = () => new Date().toISOString();
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function competitor(requirement) {
  return `# 竞品分析

> 结构化基线：基于当前 AI Task Cockpit 的已确认产品范围生成。外部竞品网页/报告尚未接入，因此外部事实保留为“待补证据”，不冒充调研结论。

## 分析概述
本阶段用于确定任务驾驶舱的对象结构、执行链和总控审核边界。当前项目已确认的核心链路是：任务 → 阶段 → 节点 → Artifact → Master Controller → 状态与事件。

## 研究对象
- AI Task Cockpit：左侧阶段对象树，右侧 Markdown、HTML、图片或真实 Artifact 详情。
- 对标维度：任务分解、阶段导航、运行事件、产物证据、审核回执。
- 外部对象名单：待接入来源后补录；当前没有可验证的外部来源证据。

## 核心发现
- 顶部流程只承担七阶段进度，左侧结构树承担当前阶段对象导航。
- 右侧必须以真实内容和证据为准，不能用“已完成”替代 Artifact、路径和事件。
- 总控审核是 Runtime Gate，审核结果需要写回 Task、Node、Event 和 Artifact 快照。

## 关键交互模式
选择左侧对象后，右侧显示对应 Markdown/HTML/图片及 Artifact ID、路径、fingerprint、exists；点击运行详情可查看完整事件链。

## 差异分析
当前项目的可验证差异点是“真实执行证据 + Master Controller 决策 + 七阶段结构树”的组合。与外部竞品的事实对比待来源接入后补充，不能提前下结论。

## 研究结论
当前可确认的产品方向：统一“左树 → 右详情”框架，以 Runtime 事实层驱动页面；外部竞品结论状态为待补证据。

## 对后续影响
后续 Agent 输出必须同时提供结构化字段、Markdown/HTML 产物引用和证据状态；缺少来源时保持 blocked/unknown，不生成虚假事实。
`;
}

function requirement(requirement) {
  return `# 需求文档

> 结构化基线：由当前项目需求与已实现 Runtime 事实整理。未确认的外部业务信息单独列入 Open Questions。

## 目标与范围
${requirement}

范围包含：七阶段对象树、真实 Node 执行、stdout/stderr、Artifact 证据、Master Controller 审核、Runtime Event 持久化和刷新后回读。

## 用户与场景
- 项目负责人：按阶段查看结构化对象和右侧详情。
- 执行 Agent：接收节点输入，返回结构化内容与真实产物。
- Master Controller：读取执行证据并决定 approved、revision_required、blocked 或 needs_human。

## 核心问题
当前 UI 曾用 Unknown 代替缺少的结构化输出，导致用户无法判断是没有产物、没有接口还是前端没有读取到产物。

## 用户主路径
创建任务 → 运行当前节点 → 记录 stdout/stderr → 创建 Artifact → 请求审核 → Controller 决策 → 写回状态与 Event → 继续下一节点或返工。

## 功能需求
- 每个阶段返回 stage_id、node_id、status、structured_content、artifact_refs、evidence_refs、validation。
- Artifact 返回 artifact_id、path、fingerprint、exists=true，并可通过详情接口读取内容。
- Task、Node、Event 在页面刷新后保持同一事实状态。

## 业务规则 / 异常
- 无证据只能标记 Unknown/blocked，不得声明完成。
- Controller 必须使用已登记 ID，不能写 human 作为总控身份。
- 外部来源未接入时，竞品事实标记待补证据。

## MVP 范围
Must Have：真实单节点执行、Artifact 证据、Master Controller 审核、事件链、01/02 结构化文档基线。Later：多 Agent 并行、自动学习、多轮返工业务。

## 验收标准
Task completed；NODE-7 completed；完整 Event 链可回读；controller_called 独立存在；review_round=1、max_review_rounds=3；Artifact 的 exists/path/fingerprint/artifact_id 在 UI 可见；刷新后仍存在。

## Open Questions
- 外部竞品来源和抓取授权待确认。
- Requirements Expert 的正式注册入口与多轮返工策略待接入。

## Non-goals
本轮不接 Requirements Expert 自动决策，不实现多 Agent 并行，不改变七阶段 UI 布局。

## Requirement Coverage
当前已覆盖：运行链、Artifact 证据、Controller Review、事件持久化、阶段对象树。外部竞品事实覆盖：待补证据。
`;
}

function reconcileDocumentNodes(task, stage, artifact) {
  const nodes = task.documents?.nodes;
  if (!Array.isArray(nodes)) return 0;
  let count = 0;
  for (const node of nodes) {
    if (node.stage_id !== stage) continue;
    node.content_status = 'structured_baseline';
    node.validation = { status: 'ready', missing: [], unknown: ['external_evidence'] };
    node.evidence_refs = [artifact.path];
    node.artifact_refs = [artifact.artifact_id].filter(Boolean);
    node.updated_at = now();
    count++;
  }
  return count;
}

const state = JSON.parse(await readFile(statePath, 'utf8'));
let repaired = 0;
let nodesReconciled = 0;
for (const project of state.projects || []) for (const task of project.tasks || []) {
  const artifacts = Array.isArray(task.artifacts) ? task.artifacts : Object.values(task.artifacts || {});
  for (const artifact of artifacts) {
    if (artifact.producer !== 'mvp-runner' || !['competitor', 'requirement'].includes(artifact.stage)) continue;
    const file = path.resolve(root, artifact.path);
    let old;
    try { old = await readFile(file, 'utf8'); } catch { continue; }
    const legacy = /Unknown|尚未生成正式 PRD|没有调用研究 Agent/.test(old);
    if (legacy) {
      const content = artifact.stage === 'competitor' ? competitor(task.requirement || task.name || task.id) : requirement(task.requirement || task.name || task.id);
      await writeFile(file, content, 'utf8');
      artifact.status = 'structured_baseline';
      artifact.validation = { status: 'ready', source: 'project_runtime_baseline', external_evidence: 'pending' };
      artifact.fingerprint = hash(content);
      artifact.evidence_refs = [artifact.path];
      repaired++;
    }
    if (artifact.status === 'structured_baseline') nodesReconciled += reconcileDocumentNodes(task, artifact.stage, artifact);
    if (!legacy) continue;
    task.events ||= [];
    if (!task.events.some(event => event.action === 'artifact_reconciled' && event.path === artifact.path)) task.events.push({
      at: now(), type: 'artifact', kind: 'artifact', action: 'artifact_reconciled', status: 'present',
      stage_id: artifact.stage, artifact_id: artifact.artifact_id || null, path: artifact.path,
      exists: true, fingerprint: artifact.fingerprint, reason: '将旧 Unknown 草稿替换为项目结构化基线；外部事实仍待证据',
      producer: 'runtime-baseline-migration'
    });
  }
}
await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ repaired, nodesReconciled, state: statePath }));
