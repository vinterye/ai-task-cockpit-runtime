# 02 需求文档：AI 任务执行驾驶舱

> 这是当前项目的结构化需求基线，所有未由 Runtime 或正式输入证明的字段保留 `unknown`。

## 目标与范围

- 目标：让真实任务可执行、可审计、可审核、可继续或返工。
- 范围：任务、七阶段、Agent 调用、Runtime Event、Artifact、Master Controller Review。
- 不在本轮：多 Agent 并行、自动学习、Requirements Expert、多轮返工业务。

## 用户与场景

- 用户：项目负责人、总控审核者、执行 Agent。
- 场景：创建任务后查看当前阶段，进入对象树查看详情，检查真实产物和事件，在审核后继续或要求返工。
- 未确认的行业用户画像：`unknown`。

## 核心问题

1. 阶段状态和真实执行状态容易混淆。
2. 文档只有 Markdown 时无法驱动左侧结构树。
3. Artifact 只有“已完成”而没有路径、指纹和存在性证明。
4. 人工审核接口不能证明 Master Controller 真正参与。

## 功能需求

### Task / Stage

- 创建任务并返回稳定 `task_id`。
- 七阶段固定顺序：竞品、需求、交互、原型、UI、开发、测试验收。
- 阶段状态来自 Runtime，不来自前端临时状态。

### Agent 输出

- 统一 `stage-agent-result/v1`。
- 必须包含 `stage_id`、`node_id`、`status`、`structured_content`、`validation`。
- Requirement 字段：目标范围、用户场景、核心问题、主路径、功能需求、业务规则、异常、MVP、验收、Open Questions、Non-goals、Coverage、Agent Routing。

### Runtime / Artifact

- Event 顺序固定：`node_started → stdout/stderr → artifact_created → node_finished → review_requested → controller_called → controller_decision_received → review_applied → task_completed`。
- Artifact 必须包含 `artifact_id`、`path`、`fingerprint`、`exists`。

### Master Controller

- 首次审核 `review_round=1`、`max_review_rounds=3`。
- 再次返工审核递增轮次。
- 第三轮仍未通过时进入 `needs_human`。

## 验收标准

- Task 可以从 pending 进入 completed。
- NODE-7 完成后停在 07 测试验收。
- Controller ID 可回读且不是 `human`。
- 审核字段和 Artifact 证据刷新后仍存在。
- 无证据字段保持 `unknown`，不得伪造完成。

