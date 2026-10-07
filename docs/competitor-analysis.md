# 01 竞品分析：AI 任务执行驾驶舱

> 状态：proposed。当前项目判断已结构化；外部来源矩阵补齐后才能升级为 ready。

## 分析概述

目标是让总控任务从需求进入、阶段执行、Artifact 生成、Master Controller 审核到继续或返工形成可回读闭环。

## 研究对象

| 对象 | 观察重点 | 证据状态 |
|---|---|---|
| Linear | 项目、任务、状态和审核信息聚合 | not_run：待补官网 / GitHub / YouTube 来源 |
| Notion | 文档结构、层级导航和详情阅读 | not_run：待补官网 / GitHub / YouTube 来源 |
| Dify | 工作流节点、运行记录和产物回读 | not_run：待补官网 / GitHub / YouTube 来源 |
| Codex / 本地 Agent 工作台 | Agent 调用、工具执行、Artifact 和审核链 | 本地项目 Runtime 可回读 |

## 当前项目核心发现

1. 左侧承担阶段对象结构树，右侧承担当前对象详情，流程进度保留在顶部。
2. 真实价值是 Node → Artifact → Master Controller → decision → next node / revision。
3. Artifact 必须带 artifact_id、path、fingerprint、exists。
4. Agent 结果必须同时提供自然语言产物和结构化字段。
5. 没有来源矩阵时，竞品研究保持 blocked / unknown，不把模型常识写成事实。

## 关键交互模式

- 顶部显示阶段状态和当前阶段。
- 左侧对象树覆盖竞品报告、需求、交互、原型、开发、测试。
- 右侧支持 Markdown、HTML、图片、真实 Artifact、Review 和 Evidence。
- Runtime 详情显示完整 Event 链。

## 差异分析

| 维度 | 本项目选择 | 不采用 |
|---|---|---|
| 导航 | 结构树与详情联动 | 任意对象打开大抽屉 |
| 执行 | 真实 Worker、stdout/stderr、Artifact | planned nodes 冒充真实执行 |
| 审核 | Master Controller 有 ID、轮次和决策 | human 假审核 |
| 不确定性 | Unknown / blocked 保留证据边界 | 为填页面补写结论 |

## 研究结论

当前 UI 外壳足够稳定，下一阶段重点是来源矩阵接入和 Agent 结构化输出。

## 阶段产物

- competitor-evidence.json：外部来源矩阵输入格式。
- stage-agent-result/v1：竞品结构化交接格式。
- docs/cockpit-api-v1.md：Runtime API 契约。
