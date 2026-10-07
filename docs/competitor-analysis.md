# 01 竞品分析：AI 任务执行驾驶舱

> 状态：文档调研草案。已阅读下列官方文档；未进行产品登录体验、性能比较或完整能力评测。产品建议与来源事实分别标注。

## 分析概述

目标是让一个总控任务从需求进入、阶段执行、Artifact 生成、Master Controller 审核到继续或返工形成可回读闭环。竞品比较只服务于这个目标，不扩展为通用项目管理工具评测。

## 研究对象

| 对象 | 观察重点 | 证据状态 |
|---|---|---|
| Linear | 项目、任务、状态和审核信息的聚合方式 | 官方文档已阅读；产品实测 not_run |
| Notion | 文档结构、层级导航和详情阅读方式 | 官方文档已阅读；产品实测 not_run |
| Dify | 工作流节点、运行记录和产物回读方式 | 官方文档已阅读；产品实测 not_run |
| Codex / 本地 Agent 工作台 | Agent 调用、工具执行、Artifact 和审核链 | 本地项目文档与 Runtime 事件可回读 |

## 核心发现

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


## 官方来源与可验证事实

- Linear：项目聚合具有明确结果的 issues，项目概览包含描述、关联文档和里程碑。[Projects 官方文档](https://linear.app/docs/projects)。
- Notion：通过页面内嵌子页面组织层级。[Subpage 官方文档](https://www.notion.com/en-gb/help/create-a-subpage)。
- Dify：官方快速入门使用节点编排 AI 工作流。[Quick Start 官方文档](https://docs.dify.ai/en/quick-start)。

## 对后续影响

以下为本项目设计推论：借鉴 Linear 的项目与任务分层、Notion 的内容层级、Dify 的节点编排，将业务对象导航与执行进度分开。以上资料不能证明这些产品缺少总控审核，也不能证明本项目具有竞争优势。下一步验证本项目各节点的输入、输出和证据是否可追溯。
