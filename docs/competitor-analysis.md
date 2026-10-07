# 01 竞品分析：AI 任务执行驾驶舱

> 状态：`proposed`。本报告先把当前项目已有的产品判断结构化；外部来源矩阵仍需宿主补齐后，才能升级为 `ready`。

## 分析概述

目标是让一个总控任务从需求进入、阶段执行、Artifact 生成、Master Controller 审核到继续或返工形成可回读闭环。竞品比较只服务于这个目标，不扩展为通用项目管理工具评测。

## 研究对象

| 对象 | 观察重点 | 证据状态 |
|---|---|---|
| Linear | 项目、任务、状态和审核信息的聚合方式 | `not_run`：待补官网 / GitHub / YouTube 来源矩阵 |
| Notion | 文档结构、层级导航和详情阅读方式 | `not_run`：待补官网 / GitHub / YouTube 来源矩阵 |
| Dify | 工作流节点、运行记录和产物回读方式 | `not_run`：待补官网 / GitHub / YouTube 来源矩阵 |
| Codex / 本地 Agent 工作台 | Agent 调用、工具执行、Artifact 和审核链 | 本地项目文档与 Runtime 事件可回读 |

## 当前项目核心发现

1. 左侧应承担阶段对象结构树，右侧承担当前对象详情；流程进度保留在顶部。
2. 真实价值在于 `Node → Artifact → Master Controller → decision → next node / revision`，而不是单纯显示阶段卡片。
3. Artifact 必须带 `artifact_id`、`path`、`fingerprint`、`exists`，否则完成状态不可审计。
4. Agent 结果必须同时提供自然语言产物和结构化字段，才能驱动七个阶段的文档树。
5. 没有来源矩阵时，竞品研究必须停在 `blocked` / `unknown`，不能把模型常识写成事实。

## 关键交互模式

- 阶段顶部：只显示流程状态和当前阶段。
- 左侧对象树：竞品报告、需求父子结构、交互计划、原型 Framework/Module/Task、开发模块、测试计划。
- 右侧详情：Markdown、HTML、图片、真实 Artifact、Review 和 Evidence。
- Runtime 详情：显示完整 Event 链，不只显示最近一条事件。

## 差异分析

| 维度 | 本项目选择 | 不采用 |
|---|---|---|
| 导航 | 结构树与详情联动 | 点击任意对象都打开大抽屉 |
| 执行 | 真实 Worker、stdout/stderr、Artifact | planned nodes 冒充真实执行 |
| 审核 | Master Controller 有 ID、轮次和决策 | `human` 假审核 |
| 不确定性 | Unknown / blocked 保留证据边界 | 为了填满页面补写结论 |

## 研究结论

当前 UI 外壳已经足够稳定，下一阶段重点是来源矩阵接入和 Agent 结构化输出落地，而不是重新设计页面。

## 阶段产物

- `competitor-evidence.json`：预留外部来源矩阵输入格式。
- `stage-agent-result/v1`：竞品结构化交接格式。
- `docs/cockpit-api-v1.md`：Runtime API 契约。

