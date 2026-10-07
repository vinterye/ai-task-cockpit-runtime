# 驾驶舱后端接口与本地 Agent 阶段适配合同

日期：2026-10-06  
状态：`candidate`   
范围：当前七阶段驾驶舱原型、现有本地 Runtime、已登记本地 Agent。  
事实边界：本文是接口与适配方案，不代表 Agent 已升级、接口已实现或已发布。

## 1. 结论

本地 Agent 需要增加机器可读的阶段输出，但不应直接破坏现有 proposal 输出。采用两层结构：

```text
本地 Agent 原生输出
  ↓ 保留原文、指纹和来源
Stage Agent Adapter
  ↓ 校验、规范化、生成树
stage-document/v1 + artifact-manifest/v1 + evidence_refs
  ↓
Runtime 持久化 task.documents.nodes
  ↓
驾驶舱左树 / 右详情 / Review
```

前端不再把静态 `documentBlueprints` 当正式数据。它只能作为开发期空数据提示；没有真实文档树时，状态必须是 `unknown`、`not_run` 或 `blocked`。

依据：

- 原型只有在 `task.documents.nodes` 存在时才读取真实树，否则调用 `makeSchemaDocumentNodes()` 生成静态蓝图：`总控交互原型.html:2085`。
- Runner 当前写入固定 Markdown，且明确说明未调用研究 Agent、未生成正式 PRD、未完成生产 Build：`scripts/mvp-runner.mjs:17-23`。
- Runtime 当前只真实调用竞品研究和需求入口，03-07 没有阶段 Agent 适配器：`server.mjs:57-88`。
- 现有 `task-envelope-v1`、`execution-trace-v1`、`review-record-v1` 与 Runtime 状态/事件命名不一致，因此通过 Adapter 映射，不修改旧合同。

## 2. 统一请求与响应包

所有驾驶舱接口使用同一包络：

```json
{
  "request_id": "REQ-...",
  "idempotency_key": "...",
  "task_id": "TASK-...",
  "run_id": "RUN-...",
  "stage_id": "requirement",
  "node_id": "requirement-overview",
  "if_version": "...",
  "payload": {}
}
```

统一响应：

```json
{
  "data": {},
  "meta": {
    "schema_version": "cockpit-api/v1",
    "request_id": "REQ-...",
    "source": "runtime",
    "generated_at": "..."
  },
  "error": null
}
```

Runtime 内部统一使用 snake_case；旧字段如 `reviewRound`、`stage`、`id` 只在兼容层映射，前端不再同时猜多种命名。

## 3. 后端接口清单

### P0：必须先实现

| 资源 | 接口 | 用途 |
|---|---|---|
| Agent | `GET /api/agents` | Agent、版本、入口、状态、合同、测试包 |
| Agent | `GET /api/agents/:agent_id` | Agent 详情和权限 |
| Agent | `GET /api/agents/:agent_id/readiness` | runtime gate、可调用状态 |
| Document | `GET /api/tasks/:task_id/documents` | 当前任务的阶段文档树 |
| Document | `GET /api/tasks/:task_id/documents/:node_id` | 左树节点右侧详情 |
| Stage | `GET /api/tasks/:task_id/stages/:stage_id/nodes` | 阶段树和节点状态 |
| Run | `GET /api/tasks/:task_id/runs` | Run 列表 |
| Run | `GET /api/tasks/:task_id/runs/:run_id` | Run 快照、版本和状态 |
| Event | `GET /api/tasks/:task_id/runs/:run_id/events` | 完整事件链，可按 stage/node/type/action 过滤 |
| Artifact | `GET /api/tasks/:task_id/artifacts` | 当前任务产物清单 |
| Artifact | `GET /api/artifacts/:artifact_id/manifest` | 标准产物合同 |
| Artifact | `GET /api/artifacts/:artifact_id/content` | Markdown、HTML、图片或 JSON 内容 |
| Review | `GET /api/tasks/:task_id/reviews` | Expert / Controller / Human 审核记录 |
| Review | `GET /api/tasks/:task_id/reviews/:review_id` | 单次审核详情 |
| Gateway | `POST /api/gateway/callbacks` | 本地 Agent / Runner 回传事件和产物 |

当前原型已经生成 `/api/gateway/callbacks`，但 `server.mjs` 没有对应路由，这是明确的 P0 缺口。

### P1：执行控制和可恢复性

```text
POST /api/tasks/:task_id/resume
POST /api/tasks/:task_id/nodes/:node_id/start
POST /api/tasks/:task_id/nodes/:node_id/pause
POST /api/tasks/:task_id/nodes/:node_id/resume
POST /api/tasks/:task_id/nodes/:node_id/retry
GET  /api/projects/:project_id/tasks
```

`/start` 不能继续兼任 resume；暂停、恢复、重试必须产生独立事件和幂等键。

### P2：后续扩展

```text
GET /api/agents/:agent_id/versions
GET /api/tasks/:task_id/compare?base_run_id=...&current_run_id=...
GET /api/tasks/:task_id/issues
GET /api/tasks/:task_id/learning-candidates
```

## 4. 统一阶段文档合同

每个左树节点都必须符合：

```json
{
  "schema_version": "stage-document/v1",
  "document_id": "DOC-...",
  "task_id": "TASK-...",
  "run_id": "RUN-...",
  "stage_id": "requirement",
  "node_id": "requirement-overview",
  "parent_id": null,
  "title": "需求总览",
  "node_type": "root|section|item|case",
  "status": "draft|ready|approved|blocked|unknown|not_run",
  "content": {},
  "children": [],
  "artifact_refs": [],
  "evidence_refs": [],
  "source_refs": [],
  "producer": {"agent_id": "", "version": ""},
  "validation": {"status": "ready|blocked|unknown", "missing": [], "unknown": []},
  "created_at": "",
  "updated_at": ""
}
```

Adapter 的统一函数：

```text
adapt(task_envelope, stage_id, node_id, input_refs,
      upstream_documents, upstream_artifacts, native_output)
  → stage_document
  → artifact_manifest
  → evidence_refs
  → adapter_validation
```

规则：保留 `native_output_ref` 和原始指纹；先校验必填字段，再生成 `parent_id / children`；缺字段不得补猜；没有真实执行只能输出 `not_run` 或 `blocked`。

## 5. 七阶段字段与适配器

| 阶段 | 左树节点 | 右侧最小字段 | 适配器与当前状态 |
|---|---|---|---|
| 01 竞品分析 | `overview / subjects / findings / interaction-patterns / difference-analysis / conclusion / follow-up-impact / artifact` | `overview`、`research_subjects`、`core_findings`、`interaction_patterns`、`difference_analysis`、`conclusion`、`downstream_impacts`、`source_refs` | `design-research-agent` / `competitor-expert`；需把 facts、inferences、unknowns、source matrix 转成 JSON Brief；当前未形成正式 stage document |
| 02 需求文档 | `requirement-overview` 及目标、用户、问题、主路径；`functional-requirements` 及 Project/Task/Stage/Runtime/Artifact/Review；规则、MVP、验收、Open Questions、Non-goals、Coverage、Routing | `goals_scope`、`users_scenarios`、`core_problems`、`main_path`、`functional_requirements`、`business_rules`、`exceptions`、`mvp_scope`、`acceptance_criteria`、`open_questions`、`non_goals`、`coverage` | `requirement-agent` / `requirement-expert`；五段稿旁增加机器可读 `requirement_document` 和可选 `prototype_brief`；`confirmed_by` 只能是 human |
| 03 交互设计 | `overview / user-flow / page-workspace / framework-planning / module-planning / task-state / exception-fallback / expert-controller / artifact` | `user_flows`、`page_relations`、`framework_plan`、`module_plan`、`task_state_plan`、`exceptions`、`review_flow`、`interaction_html_ref` | 当前无正式交互 Agent；先注册 adapter，缺入口时明确 `blocked/not_run`；此阶段只认交互 HTML |
| 04 原型 | `Framework → Module → Task/State → Artifact/Review` | `framework`、`modules`、`tasks`、`states`、`interaction_contract`、`prototype_html_ref` | `prototype-agent` + `frontend-technical-agent`；复用 `prototype-stage-artifact-v1` / `design-contract-candidate-v1`，不自签人工 Gate |
| 05 UI 设计 | `design-input / design-analysis / pages / components / state-styles / design-tokens / artifact` | `design_inputs`、`design_analysis`、`pages`、`regions`、`components`、`state_styles`、`design_tokens`、`visual_direction` | `ui-design-agent` + `frontend-technical-agent`；接受图像稿与设计说明，不生成 HTML/代码 |
| 06 开发 | `technical-contract / task-workspace / runtime / review-system / shared / artifact` | `technical_contract`、`modules`、`api_contracts`、`files`、`build_result`、`runtime_result`、`review_status` | backend/frontend/algorithm technical agents 目前只是 advisory；正式 Implementation Worker adapter 尚缺；未执行时必须 `not_run` |
| 07 测试验收 | `test-plan / task-workspace / runtime / review / regression / e2e / blocking / final-acceptance` | `test_plan`、`cases`、`expected`、`actual`、`stdout`、`stderr`、`artifact_refs`、`evidence_refs`、`regression`、`blocking_issues`、`final_acceptance` | Runtime/Test adapter；每个 case 必须有 evidence；固定 Markdown 不能当 pass |

## 6. Agent 是否需要改输出

### 必须改：阶段生产者

以下 Agent 的输出需要增加机器可读结构，但保留原有自然语言 proposal：

```text
design-research-agent / competitor-expert
requirement-agent / requirement-expert
prototype-agent
ui-design-agent
真实 Implementation Worker
真实 Test Worker
```

新增最小字段：

```text
stage_id
node_id
input_snapshot_sha256
structured_content
artifact_refs
evidence_refs
validation
native_output_ref
```

### 不应直接改成阶段文档：技术专家

`frontend-technical-agent`、`backend-technical-agent`、`algorithm-technical-agent` 保持只读咨询角色，保留：

```text
facts
inferences
unknowns
human_choices
tradeoffs
risks
technology_recommendation
handoff
```

只增加：

```json
{
  "requirement_coverage": [
    {
      "requirement_id": "REQ-001",
      "status": "supported|supported_with_constraint|specialized|blocked",
      "technology": "",
      "constraints": [],
      "risks": [],
      "follow_up": ""
    }
  ],
  "technical_decision_ref": "TDR-..."
}
```

它们不能直接生成交互 HTML、UI、代码或正式开发阶段完成状态。

### 不能接入正式阶段的 Agent

以下当前只能作为规划或候选能力：

- goal-driven execution Agent：candidate-only，只能产出能力目录、候选计划、调用信封、能力缺口；
- parallel orchestrator：not_implemented；
- `agent-agent-*`、`rule-agent`、`tool-agent` 等 draft / not_implemented 资产：缺 entrypoint、输入合同、输出合同或测试包；
- Master Controller：只能作为审核适配器，不能作为阶段文档生产者；其 usage card 的 input/output contract 仍为 `unknown`。

## 7. Registry 与 Adapter 注册要求

当前 `agent_builder/tools/agent_adapters.py` 只注册 requirement、review、design-research、learning、growth、note、document-ingestion，缺少 frontend/backend/algorithm、prototype、ui-design、Master Controller、testing adapter。

每个 adapter 注册项至少包含：

```json
{
  "adapter_id": "prototype-agent-stage-adapter",
  "agent_id": "prototype-agent",
  "stage_ids": ["prototype"],
  "input_schema": "task-envelope-v1",
  "output_schema": "stage-agent-result/v1",
  "document_schema": "stage-document/v1",
  "artifact_schema": "artifact-manifest/v1",
  "entrypoint": "",
  "permissions": [],
  "status": "verified|candidate|blocked|not_run",
  "test_pack_id": ""
}
```

## 8. 发版门禁

一个阶段节点只有同时满足以下条件，才能显示 `ready` 或进入 Master Controller 审核：

1. Agent Registry 中有真实 `agent_id / version / entrypoint / runtime_gate`；
2. Adapter 校验为 `ready`；
3. `stage-document/v1` 必填字段齐全；
4. `artifact-manifest/v1` 合法；
5. `source_refs / evidence_refs` 有值，或明确标记 `unknown/not_run`；
6. 事件包含 `agent_called → artifact_created → agent_completed`；
7. 右侧可回读原始产物、路径、指纹和存在性；
8. 刷新后从 API 重新读取仍保持一致；
9. 未执行、阻塞、未知不能被转换成 `completed`。

当前只有 Runtime Node → Artifact → Master Controller → completed 这条 MVP 闭环已验证；七阶段 Agent 真实产物尚未达到以上门禁。

## 9. 实施顺序

1. 先实现 P0 API 和统一响应包；
2. 增加 `stage-agent-result/v1`、`stage-document/v1` Adapter 层，不改旧 Agent proposal 合同；
3. 先接 01、02、07，形成真实文档、审核、测试证据闭环；
4. 接 04、05；技术专家只作为咨询输入；
5. 补 03 交互 Agent 和 06 Implementation Worker，缺入口时保持 blocked/not_run；
6. 最后将前端静态蓝图降级为开发期 fallback，并以 API 返回的 `documents.nodes` 为唯一正式树源；
7. 用一个全新 Task 做浏览器回归，验证接口、结构树、详情、Artifact、Review、刷新和错误状态。

本方案不新增 Agent、不改变既有 Agent 版本、不自动发布、不扩大权限，也不把候选 proposal 直接写成正式事实。

## 10. 2026-10-06 自检与已实施项

本次对原型、`server.mjs`、Runtime 状态结构和本地 Agent 注册表复核后，已补齐以下实现：

- `agent_builder/tools/stage_document_adapter.py`：新增 `stage-document/v1` / `stage-agent-result/v1` 规范化适配器；保留 native output 指纹，缺字段返回 `unknown/not_run`，不猜测内容。
- `agent_builder/tools/agent_adapters.py`：注册 requirement、research、prototype 的阶段文档适配入口；原有 proposal 入口不变。
- `server.mjs`：补齐文档节点详情、项目任务列表、Gateway callbacks、事件查询过滤、节点 start/pause/resume/retry 路由。
- `agent_builder/tests/test_stage_document_adapter.py`：覆盖缺失输出 fail-closed 和 requirement 文档合同。

仍然明确为后续计划、未在本次伪装完成的项：03 交互阶段真实 Agent、06 Implementation Worker、真实 Test Worker、草稿 Agent 的正式注册，以及 P2 compare/issues/learning-candidates 接口。它们继续显示 `blocked`、`not_run` 或 `candidate`，直到有真实入口、合同和测试证据。

本轮新增真实回归：`TASK-1791327219976` 在独立进程重新读取后仍为 `completed`，`NODE-7=completed`，事件顺序完整包含 `node_started → node_stdout → node_stderr → artifact_created → node_finished → review_requested → controller_called → controller_decision_received → review_applied → task_completed`；Controller ID、`review_round=1`、`max_review_rounds=3`、Artifact `exists/path/fingerprint` 均可回读。空 stderr 也记录为真实 IO 流关闭事件，不视为伪造输出。

## 11. 2026-10-07 兼容包、Agent 结构化输出与能力缺口

本轮按“先保留旧前端、再接真实 Agent”的范围实施：

- `server.mjs` 增加 `/api/v1/*` 兼容前缀。响应统一为 `{ data, meta, error }`，`meta.schema_version=cockpit-api/v1`，并带 `request_id/source/generated_at`；原 `/api/*` 路由保持旧响应形状。
- requirement Agent 的 prompt 与 CLI bundle 增加 `stage-agent-result/v1` 的 `output_contract`，要求输出目标、范围、用户场景、功能需求、业务规则、MVP、验收、Open Questions、Non-goals、Coverage、Agent 流转等结构化字段；缺失字段必须为 `unknown`。

### P1/P2 收尾回归（2026-10-07）

- `adaptNativeStageResult` 现在把 requirement Agent 的 `output_contract` 映射为 `structured_content`；当 Agent 没有返回正文时，仍保留完整字段集合并逐字段标记 `unknown`，避免前端收到空对象。
- `revision_required` 重新执行不会把 `review_round` 清零；已有第 1 轮的任务再次进入 Master Controller 后得到 `review_round=2`，`max_review_rounds=3`。全新任务仍从第 1 轮开始，达到第 3 轮由 `applyControllerReviewRound` 转为 `needs_human`。
- 真实重跑探针：`TASK-1791331055202` 从 `revision_required + review_round=1` 重新执行后为 `completed`，Controller 事件依次记录 `controller_called → controller_decision_received → review_applied → task_completed`，且这些事件均回读 `review_round=2`、`max_review_rounds=3`。
- 竞品阶段排查：本地 `design-research-agent` 在没有宿主提供官网 / GitHub / YouTube 来源矩阵时，按既定证据门返回 `blocked`；服务端此前只把结果写到 `overview`，导致“核心发现”等子节点误显示为“尚无”。现已按 `STAGE_STRUCTURED_FIELDS` 把竞品与需求结构化字段分发到各文档节点；阻塞时显示明确原因，不生成伪造竞品结论。
- design-research Agent 的 prompt 与执行适配器增加竞品阶段结构化交接块：概述、研究对象、核心发现、关键交互模式、差异分析、结论、后续影响，以及 source/artifact/evidence/validation 引用。
- Runtime 对 03 交互、06 开发、07 测试按 Registry 真实能力登记结果；在本节实施前曾缺少三个可连接 entrypoint，缺口期间只记录 `not_run` 与 `agent_capability_gap`，不伪造完成状态。当前入口已在第 12 节登记并通过回归。
- `prototype-stage-harness` 的全量 pack 基线补齐为 16 个 pack / 15 个 active pack；全量 Agent Builder 测试基线修正后通过。

本轮验证：`agent_builder` 全量 `290 passed, 1 xfailed`；Runtime `node --check` 通过；requirement/runtime Node 合同测试 2/2 通过；design-research Agent Python AST 解析通过。`agent-toolkit/design-research-agent` 当前无可收集的 pytest 测试，因此不把它计为行为测试通过。

当前仍未完成的是三个真实本地 worker 的注册与入口连接。这是能力缺口，不是 UI 或接口兼容问题；一旦 Registry 提供真实 entrypoint，Runtime 已有 fail-closed 记录与 `stage-agent-result/v1` 持久化路径可接入。

## 12. 2026-10-07 P0 Worker 接入回归

已登记并接入三个本地 Worker，统一入口为 `scripts/stage-workers/run-worker.mjs`，通过 stage 参数区分职责：

- `interaction-agent`：输出交互主路径、页面工作区关系、模块与状态规划。
- `implementation-worker`：输出 Technical Contract、Backend / Frontend / Integration 执行顺序和审核状态。
- `test-worker`：输出测试计划、测试用例、Expected 与 PASS 结果。

三个 Worker 都真实写入 `runtime/artifacts/<task>/<run>/`，返回 `artifact_id / path / fingerprint / exists=true`，并由 Runtime 写入 `agent_called → agent_completed` 与 `stage-agent-result/v1`。Registry 中状态为 `verified`，版本为 `local-worker-v1`。

新任务 `TASK-1791328491261` 回归结果：任务 `completed`，当前阶段 `testing`；03、06、07 三个阶段均返回 `native_status=completed`、`validation.status=ready`，Artifact 路径与 fingerprint 可回读。现有竞品 / 需求 Agent 仍因本地正式入口超时而标记 blocked，未影响本轮 Worker 接入，也没有被伪装为完成。

接口层新增阶段树 `/tree` 别名，以及节点 `/review`、`/revise` 入口，分别复用现有 Controller Review 与修改请求状态机；未新增第二套状态转换逻辑。

全量回归中发现新增 Registry Agent 后运行时审计的访问策略计数未同步，已为三个 Worker 登记 `local_runtime` 访问策略，并保持发布、删除、外部发送、权限变更等动作禁用。最终 Agent Builder 回归：`290 passed, 1 xfailed, 7 subtests passed`。

## 13. 2026-10-07 P1/P2 证据与验收接口

- `taskArtifactList()` 现在聚合任务主 Artifact、Runner Artifact 和阶段 Worker `artifact_refs`，并按 `artifact_id/path/fingerprint` 去重；`GET /api/v1/tasks/:task_id/artifacts` 可直接返回 03/06/07 Worker 产物。
- Review 查询补齐 `artifact_id / path / fingerprint / exists`，同时返回 `review_round / max_review_rounds`。
- 新增 [cockpit-api-v1.md](../docs/cockpit-api-v1.md)，记录兼容响应、任务/阶段、事件、Artifact、Review、Worker 输出和 Runtime 门禁。
- 已启动本地 Runtime：`http://127.0.0.1:3000`。浏览器自动打开受策略限制时，仍可通过同一 Runtime API 回归验证。

P1/P2 当前剩余：Implementation Worker 仍是契约和执行计划型 Worker，尚未承担真实业务源码修改；竞品 / Requirement Agent 的正式入口超时问题仍需单独优化；多轮返工业务和真实代码变更后的测试闭环尚未扩展。

本轮继续处理：竞品 / Requirement Agent 的本地调用超时从 12 秒提高到 30 秒，超时结果保持 `needs_human`，不伪装成完成。新任务 `TASK-1791329782755` 回归显示 competitor / requirement 为真实 `needs_human`，03/06/07 Worker 均为 `native_status=completed`；任务主链仍完成。Review Round 逻辑已经固定为首次 1、最大 3，达到上限且未批准时转 `needs_human`。

新增 `applyControllerReviewRound()` 纯契约函数和回归：第 1、2 轮保留 `revision_required`，第 3 轮转 `needs_human`，即使第 3 轮原始决策为 `approved` 也保留批准结果。测试文件为 `tests/controller-review-rounds.test.mjs`。
