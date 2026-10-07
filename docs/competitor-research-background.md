# Agent 成长与进化竞品分析

> **执行状态（2026-09-29）**：本文建议已完成本地入口核对；随后按用户批准的受限低风险范围写入候选能力。运行时闸门仍保留人工确认边界，没有把候选实现标记为已生效。

> **本轮更新（2026-09-29）**：用户已批准一条受限低风险白名单，候选进化能力已写入本地模块并通过 9 条隔离测试。现在已补上事件触发：研究流程发现有效 `evolution-handoff/v1` 后自动调用评估桥并写入项目事件流；能力仍只生成 `candidate`，不自动确认、不自动改生效版本。

> **真实项目验证（2026-09-29）**：已用 AI 驾驶舱现有 8 个竞品研究分段建立 baseline。发现部分分段只有“观察到的能力 / 对项目的启发”，没有逐竞品的“不要借鉴”边界；候选 `candidate-competitor-skill-001` 已自动登记。隔离 reviewer 试跑拦出 6/8 个 `changes_requested`，但没有擅自重写旧产物，成对评估保持 `human_review`。[验证记录](/Users/tianhua/Documents/ChatGPT/测试/runs/competitor-skill-validation-2026-09-29/COMPETITOR-SKILL-VALIDATION-2026-09-29.md)

> **入口冒烟补充（2026-09-29）**：真实 `design-research-agent/run.py` 已验证有效 `evolution-handoff/v1` 会自动进入评估桥，重复交接按 `candidate_id` 去重；没有 handoff 的普通研究仍停在人工门。当前入口只自动评估候选，不自动重生成 8 个研究产物，因此候选仍是 `human_review`，不能宣称质量已改善。

> **候选重跑补充（2026-09-29）**：隔离目录已完成 8 个案例、59 条证据的结构化候选重排。Reviewer `pass`，paired regression `pass`（6 个改善、0 回归、0 unknown）；但新增“不要借鉴”是基于已有资料的候选推论，没有新增外部抓取，候选仍需人工确认，未写回正式 Skill。[候选重跑](/Users/tianhua/Documents/ChatGPT/测试/runs/competitor-skill-validation-20260929/candidate/candidate-rerun.md)

> **正式写回补充（2026-09-29）**：用户确认后，已将最小“交付前竞品审查”规则写入 `/Users/tianhua/ai-prototype-agent/.trae/skills/competitor-analysis/SKILL.md`。只影响后续报告的结构审查，不改已有研究文档，也不自动确认研究结论。

实现位置：`ai-prototype-agent/agents/prototype-agent/review-learning/evolution/runtime.mjs`（证据、预算、成对回归）、`ledger.mjs`（复用 `.ai-project/log.jsonl` 问题账本）、`bridge.mjs`（事件触发与双向回执）、P0 `research_evidence_registered` 入口，以及 `design-research-agent` 的研究 Prompt / Workflow / 竞品 Skill；验证用例为 `tests/prototype-agent/evolution-runtime.test.mjs` 与 P0 事件触发测试。

验证：新增隔离用例 `9/9 PASS`；P0 事件触发与安全阻断测试 `2/2 PASS`，P0 原有回归 `15/15 PASS`；原型仓库全量 `240/241 PASS`，唯一失败是既有 Requirement Agent 种子数断言（账本当前 11 条、断言仍为 7 条），未因本次进化改动产生，保持原样并单独记录。

连接性审计（已复测）：现在是**事件自动触发**，不是周期调度。`research_evidence_registered` 发现有效 `evolution-handoff/v1` 后，会把交接物传给 `design-research-agent/run.py`；运行时闸门放行后，`evolution/bridge.mjs` 自动调用原型评估函数并复用项目 `.ai-project/log.jsonl`。实测项目事件流出现 `design-research-agent → prototype-agent` 的 `evolution.issue` / `evolution.candidate`，以及带 `reply_to` 的 `prototype-agent → design-research-agent` `evolution.evaluation`。没有 handoff 的普通研究仍保持原来的手工 MVP 行为；没有新增后台周期任务，也不会自动确认、发布或写入 `confirmed`。原有 `prototype-agent → requirement-agent` 经验注入仍保持不变。

入口级冒烟还确认了同一 `candidate_id` 重试会返回去重结果，不重复写事件；这验证的是触发链和幂等性，不等于候选研究内容已经重跑。

P0 真实冒烟结果：流程在原有 `framework_confirmed` 人工门停住；同一轮项目事件流出现 `evolution.issue`、`evolution.candidate`、`evolution.evaluation` 三类事件，候选状态为 `candidate`，`human_confirmation_required=true`。同一 `candidate_id` 重试会去重，不重复追加事件。

> 研究日期：2026-09-29
> 研究主题：SkillAdam、Agent skill / memory / prompt / workflow 的持续改进，以及它们对本地 Agent 体系的可借鉴部分。
> 研究状态：`implemented-candidate`；候选能力已落到本地模块，仍不自动确认长期事实或替换生效版本。
> 本地入口：按 `.trae/skills/competitor-analysis/SKILL.md` 的竞品分析协议整理；首次直接调用曾返回 `needs_human_confirmation`，随后按用户批准的候选进化低风险入口通过闸门，未冒充自动生成或自动确认结果。

## 1. 先给结论

这篇小红书文章有用，但定位应是**论文导读和架构启发**，不是独立证据。

文章标题是《腾讯×人大 SkillAdam：让 Skill 学会稳定进化》，抓住了 SkillAdam 的两个核心问题：

1. **方向稳定性**：后一轮反馈不能把前几轮已经验证有效的修复覆盖掉。
2. **更新自适应性**：不同案例的改善是否稳定，应该决定下一轮修改范围，而不是每次都大改。

论文把这两个想法分别实现为：记录历史问题与尝试结果的优化记忆，以及根据案例级波动调整的编辑预算。论文摘要称，它在七个 benchmark 上取得更稳定的优化过程，并以更少的迭代和成本获得更强的 Skill；具体数字只适用于论文实验，不代表本地 Agent 会获得同等收益。[SkillAdam 论文](https://arxiv.org/abs/2609.08944)

对本地体系最有价值的不是新增一个“进化 Agent”，而是给现有的 Skill / Prompt / Experience 增加一条受控的晋级链：

```text
真实任务与失败
  ↓
问题记录：问题 → 尝试 → 结果 → 副作用
  ↓
候选修改：限定范围与编辑预算
  ↓
成对回归：旧用例不退化，新用例改善
  ↓
人工确认
  ↓
版本化写回，可回滚
```

第一阶段只建议增加三个能力节点，不增加三个新 Agent：

| 能力节点 | 作用 | 进入现有链路的位置 |
|---|---|---|
| Evidence Extractor | 把来源、原文事实、日期、证据等级和推论分开 | 竞品研究之后、分析之前 |
| Competitor Reviewer | 检查来源可追溯、事实/推论分离、结论是否可行动 | 竞品报告初稿之后 |
| Evolution Evaluator | 比较 baseline 与 candidate，执行旧用例回归、新问题验证和晋级判定 | Prompt / Skill / Workflow 写回之前 |

SkillAdam 的 Issue Tracker、Edit Budget、候选验证和回滚，应先作为数据与门禁加入现有 `review-learning` / `experience` 线路；当前不值得新增后台自主进化系统、多 Agent 群聊、数据库或无限版本搜索。

## 2. 横向对比表

| 方案 | 主要进化对象 | 反馈与评测 | 稳定性 / 回滚 | 证据与成熟度 | 对本地的可借鉴点 | 暂不照搬 |
|---|---|---|---|---|---|---|
| [SkillAdam](https://arxiv.org/abs/2609.08944) / [GitHub](https://github.com/ruc-datalab/SkillAdam) | `SKILL.md` 等技能文档 | 任务执行结果、case-level feedback、候选 Skill 验证 | Issue Tracker 稳定方向；volatility-driven Edit Budget 限制修改幅度；通过验证才替换 | 论文 + 开源仓库；论文为 2026-09-08 提交的 arXiv 版本 | 最贴合当前问题：问题账本、编辑预算、成对回归、版本审改 | 不直接把第三方安装器接入本地；论文 benchmark 数字不外推 |
| [SkillOpt](https://arxiv.org/abs/2605.23904) / [项目页](https://microsoft.github.io/SkillOpt/) | Skill 文档，视为冻结 Agent 的外部参数 | scored rollouts、held-out validation | bounded add/delete/replace；验证集严格提升才接受；拒绝编辑缓冲区和慢更新 | 论文 + 微软项目页；研究型 | 对本地最重要的补充是“拒绝编辑也要留证据”，并把编辑预算写成可解释的 textual learning rate | 不直接引入训练式 optimizer；当前先做离线候选和人工 Gate |
| [SkillAxe](https://arxiv.org/abs/2606.10546) | Skill 改进 brief 与技能质量维度 | quality impact、trigger precision、instruction compliance、solution-path coverage | 先归因问题再提结构化改进，不直接覆盖 Skill | 论文，研究型 | 可把本地竞品 / 原型 Skill 的质量拆成四个检查维度 | 暂不把四维分数做成自动总分；没有样本时保持 `not_run` |
| [SkillOS](https://arxiv.org/abs/2605.06614) | Skill curator 与外部 SkillRepo | 延迟反馈：任务流中后续相关任务对先前 Skill 的反馈 | Executor 与 curator 分离，Skill 由外部库管理 | 论文，研究型 | 证明“执行 Agent”和“技能整理/晋级”应分离，符合现有 review-learning 方向 | 不新增常驻 curator Agent；先用现有评审步骤承接 |
| [GEPA](https://arxiv.org/abs/2507.19457) / [GitHub](https://github.com/CerebrasResearch/gepa) | Prompt、代码、文本规格等可演化文本 | 轨迹、工具调用、工具输出和结构化 metric feedback | 通过 mutation、reflection、Pareto-aware selection 保留互补候选，而不是只保留一个最高分 | ICLR 2026 论文 + 官方实现 | 候选不应只看单一总分；可按事实性、覆盖率、可行动性分别保留 Pareto 候选 | 不在没有稳定 metric 的情况下自动优化所有 Agent |
| [Darwin Gödel Machine](https://arxiv.org/abs/2505.22954) | Agent 代码、工具和工作流 | coding benchmark 验证 | 维护 Agent archive，允许从较差分支继续探索；sandbox + human oversight | 论文，SWE-bench / Polyglot 实验 | 保留可回滚的 Prompt / Workflow 版本树，不覆盖唯一生产版本 | 不做开放式自改代码；本地任务规模和验收集不足 |
| [EvoAgent](https://arxiv.org/abs/2406.14228) | 多 Agent 结构与角色配置 | evolutionary operators：mutation、crossover、selection | 多候选比较 | 论文方法，研究型 | 若未来确有多 Agent 协作问题，可用于比较角色编排候选 | 当前本地瓶颈不是 Agent 数量，先不引入多 Agent 进化 |
| [EvoAgentBench](https://arxiv.org/abs/2607.05202) / [GitHub](https://github.com/EverMind-AI/EvoAgentBench) | 可迁移的 Ability / skill | trace-grounded Ability、跨任务 transfer、错误避免和技能命中 | 以纵向增长曲线而非单次快照衡量 | 论文 + benchmark 仓库 | 给本地成长系统补“跨任务迁移、长期增长、技能命中率”指标 | 不把公开 benchmark 直接当成本地业务金测试 |
| [MemSkill](https://github.com/ViktorAxelsen/MemSkill) | Memory skill 与技能选择策略 | 离线 trace 构建记忆，环境 rollout 提供下游反馈，再挖掘 hard cases | 先用 Batch A 建构，Batch B 反馈后修订或新增 Skill | GitHub / NeurIPS 2026 项目说明 | 将“经验记忆构建”和“真实任务反馈”分成两路，避免只凭聊天总结写入 | 不引入训练管线；本地先做可追溯候选经验 |
| [Mem2Evolve](https://aclanthology.org/2026.acl-long.952.pdf) | Agent、工具、经验记忆等资产 | trajectory evaluator 输出成功/失败与 critique；新资产必须通过生成测试 | Self-correction loop；测试未通过不能进入资产记忆 | ACL 2026 论文 | 经验写回前自动生成针对性测试；把资产质量和答案质量分开 | 不采用纯 LLM Judge 作为唯一通过条件 |
| [skill-evolution](https://github.com/Carlo1911/skill-evolution) | Skill 文本、提案、工具调用、分析 Prompt | 四类目标分别评分；默认只有 Skill 文本能门控自动写回 | auto-apply 默认 gated；其余目标先做 observability | 开源实践，非论文标准 | 提案质量、工具调用质量、分析器质量可以分别观测 | 不直接复制其 Host Adapter 或自动写回策略 |
| [AlphaEvolve](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/) | 可执行程序与算法候选 | 自动 evaluator 给出量化分数，程序数据库做 evolutionary selection | 通过可执行评测筛选候选 | Google DeepMind 官方介绍，代码/算法场景 | 演进必须绑定可量化 evaluator；评测器是核心基础设施 | 竞品报告没有同等客观 evaluator，不能套用程序进化规模 |
| [Voyager](https://arxiv.org/abs/2305.16291) | 可复用技能库 | 环境反馈、执行错误、自验证 | 技能只有执行成功并满足验证才入库 | 论文，Minecraft 场景 | Skill 需要描述、检索、执行验证和组合，而不是只保存自然语言总结 | 不把开放世界技能库当成本地个人 Agent 的必要复杂度 |
| [Reflexion](https://arxiv.org/abs/2303.11366) | 语言化经验与 episodic memory | 外部或内部反馈生成 verbal reflection | 依赖后续 trial 检验经验是否有效 | 论文，早期经验学习范式 | 失败后沉淀短 lesson，下一轮复用 | 不把模型自评直接当事实；必须保留外部证据 |
| [Self-Refine](https://arxiv.org/abs/2303.17651) | 单轮输出 | draft → specific feedback → refine | 没有独立 verifier 时可能把错误当正确 | 论文，通用任务范式 | 竞品报告可先初稿，再由独立 reviewer 按固定维度复核 | 不把同一模型的自评当唯一验收 |

### 小红书文章与原始证据的分层

| 层级 | 内容 | 处理方式 |
|---|---|---|
| 社媒二次解读 | 执行 → Reflection → 改 Skill → 重跑容易越改越乱；未来成熟 Agent 需要 Skill CI/CD | 作为启发，不作为定量证据 |
| 论文事实 | 方向稳定性、更新自适应性、优化记忆、编辑预算、七个 benchmark | 可引用，但结论受实验设置约束 |
| GitHub 实践 | 支持 Codex、Claude Code、Cursor Agent、GitHub Copilot；默认验证通过后才更新 Skill | 用于判断工程形态，不等同于本地可直接安装 |
| 本地推论 | 先加问题账本、编辑预算、回归门和回滚 | 作为 `candidate`，需要本地任务验证 |

## 3. 共同做法

### 3.1 进化对象都不是“模型变聪明”这一句空话

成熟方案会明确变什么：

- SkillAdam、Reflexion、Voyager：经验、技能和记忆。
- GEPA：Prompt、代码和文本规格。
- DGM、EvoAgent：Agent 代码、结构或角色编排。
- AlphaEvolve：可执行程序和算法候选。
- Mem2Evolve：Agent、工具、资产记忆和经验记忆。

本地也应先限定对象：本轮只研究 **竞品分析 Skill、Requirement Agent Prompt、Prototype Brief 规则和 review-learning 经验条目**，不把整个 AIOS 当作可自动改写对象。

### 3.2 都需要“执行证据 → 反馈 → 候选”的闭环

只保存最终答案不够。至少要保留：

```text
输入任务
→ 运行轨迹 / 工具调用
→ 最终产物
→ 失败或成功证据
→ 具体问题与反馈
→ candidate diff
→ 回归结果
```

OpenAI 的 Agent Evals 文档也采用这个顺序：先看 trace，再用 grader，稳定后沉淀 dataset 和 eval runs。它明确把模型调用、工具调用、guardrail 和 handoff 放进一次 trace，再用结构化标准找回归和失败模式。[OpenAI Agent Evals](https://developers.openai.com/api/docs/guides/agent-evals)

### 3.3 都需要保留候选和历史，而不是覆盖当前版本

DGM 的关键不是“每次都变好”，而是维护 Agent archive，让较差分支仍然可以被复用；GEPA 维护 Pareto 候选；SkillAdam 记录问题与尝试；本地已有 `candidate → confirmed` 和回滚机制，可以直接作为基础。

### 3.4 评测目标必须能区分多个维度

只用一个总分会掩盖问题。竞品分析至少应区分：

- 来源可追溯率；
- 事实 / 推论分离率；
- 关键竞品覆盖率；
- 未确认信息标注率；
- 结论可行动率；
- 重复研究率；
- 旧任务回归通过率；
- 新问题改善率；
- 用户确认后的复用成功率。

GEPA 的 Pareto 思路说明，不同任务维度可能存在取舍；本地不应只追逐一个“报告总分”。

### 3.5 自动化写回前需要门禁

各类方案的共同工程规律是：生成候选可以自动化，写回生产版本必须经过验证；对有副作用的变化还需要人工确认。SkillAdam README 明确把验证放在更新之前；Mem2Evolve 也要求新资产先通过由 critique 生成的测试；本地的 runtime gate、人工确认、experience confirmed 和事务回滚可以承接这一层。

## 4. 主要差异

| 维度 | 研究型进化系统 | 本地 Agent 体系 |
|---|---|---|
| 目标 | 在固定 benchmark 上提高分数、迁移能力或技能命中 | 让真实项目的需求、原型、研究和治理少返工、可追溯 |
| 反馈 | 可重复 rollout、自动 grader、程序 evaluator | 真实项目产物、测试、人工确认、review-learning 记录 |
| 进化粒度 | 可成千上万轮 mutation / selection | 应以一次明确失败或可复用经验为单位，避免无限调整 |
| 版本策略 | archive、Pareto frontier、候选树 | candidate / confirmed / rejected、事务回滚、人工 Gate |
| 成本 | 允许大量模型调用和并行搜索 | 个人本地系统需要控制 token、时间和维护成本 |
| 风险 | benchmark overfitting、错误自修改、代码副作用 | 把猜测写入长期规则、跨 Agent 污染、门禁被绕过 |
| 适合本地的部分 | 结构化反馈、回归、候选保留、编辑预算 | 直接复用并嵌入现有治理 |
| 不适合当前的部分 | 开放式自改代码、后台进化、复杂多 Agent 搜索 | 暂不引入，除非真实任务证明现有闭环不足 |

Anthropic 的工程建议也支持这个取舍：先用最简单、可组合的 workflow；只有任务确实需要灵活决策时才增加 Agent 复杂度。[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

## 5. 值得关注的设计

### 5.1 本地能力基线

| 本地对象 | 已有能力 | 本轮确认的缺口 |
|---|---|---|
| `ai-prototype-agent` | Requirement → Prototype Brief → spec；门禁；experience candidate / confirmed；事务回滚；新增 issue ledger、编辑预算和 paired regression 候选评估 | 已用 8 个真实竞品研究分段建立 baseline；候选结构重排已通过 paired regression，仍需人工确认，不能自动改生效版本 |
| `design-research-agent` | Design Research Brief；竞品章节；3–5 个竞品固定拆解；人工确认 Gate；按需 Evidence Extractor / Competitor Reviewer / Evolution Handoff | `run.py` 仍是 runtime gate 适配器，研究执行仍由人工触发；不新增第二套持久化事实库 |
| `.trae/skills/competitor-analysis` | `/竞品 <明确主题>`；场景不明先问；横向输出；新增证据等级、竞品审查和案例级回归边界 | 不引入数据库、RAG、通用评分或复杂 CLI；只允许受控候选评估 |
| `agent-toolkit` 治理 | runtime gate、decision gateway、method registry、人工确认、candidate / confirmed 边界；新增候选进化低风险白名单 | 候选必须在真实任务验证后，才可能进入人工确认流程 |
| `growth-agent` | 有成长对话和蒸馏候选机制 | 尚未把“竞品洞见 → 本地失败案例 → 可验证方法”接成闭环 |

### 5.2 最小演进方案

不新增 Agent，先在现有竞品分析和经验机制上补四个结构化对象：

```json
{
  "issue": {
    "id": "issue-...",
    "scope": "competitor-analysis|requirement|prototype",
    "observed_in": "run_id",
    "problem": "来源和推论混在一起",
    "severity": "P1"
  },
  "attempt": {
    "candidate_id": "candidate-...",
    "change_summary": "增加来源/事实/推论三层输出",
    "edit_budget": "small",
    "rationale": "降低不可追溯结论"
  },
  "evaluation": {
    "baseline": {"traceability": 0, "coverage": 0, "actionability": 0},
    "candidate": {"traceability": 0, "coverage": 0, "actionability": 0},
    "regressions": [],
    "new_case_improvements": [],
    "status": "not_run"
  },
  "promotion": {
    "state": "candidate",
    "human_decision": null,
    "rollback_to": null
  }
}
```

### 5.3 第一批验证任务

以 `.trae/skills/competitor-analysis/SKILL.md` 或 Requirement Agent 的 Prototype Brief Prompt 作为单一目标对象，先准备 8–12 个固定样例：

1. 场景明确、竞品未提供：能列候选，并说明为什么值得看。
2. 场景不明确：只问一个必要问题并停止。
3. 用户给出竞品：不擅自扩展到完整产品评测。
4. 论文、官方文档、GitHub、社媒混合来源：能分级并保留 URL。
5. 来源只支持部分结论：把其余内容写成未确认或推论。
6. 同一主题重复调研：能识别已有事实，避免重复追问。
7. 竞品功能看似相同但目标不同：能写出“不适用及原因”。
8. 候选 Prompt 改善新问题：旧样例不能退化。
9. 候选 Prompt 让一个样例变好、另一个变坏：缩小编辑范围或拒绝写回。
10. 用户拒绝候选：保留 evidence 和 diff，但不改当前版本。

通过条件：

- 旧样例全部不退化；
- 新问题至少一项有明确改善；
- 每个事实结论有来源或标记 `未确认`；
- 每个候选变更有 diff、运行编号和回归结果；
- 未经人工确认不写入长期 Skill / Prompt；
- 失败候选可恢复到 baseline。

### 5.4 不建议现在做的事

- 不新增“进化 Agent”或后台常驻优化器。
- 不引入数据库、RAG、复杂评分系统或自动设计。
- 不让 Agent 自己修改治理规则、权限、版本和运行时闸门。
- 不把所有对话全文写入长期记忆；只写结构化事实、问题、候选和证据。
- 不以一次论文 benchmark 提升为本地收益承诺。
- 不用同一个模型的自评作为唯一通过条件。

## 6. 未确认信息与调用边界

### 已确认

- 小红书正文可通过浏览器读取；标题为《腾讯×人大 SkillAdam：让 Skill 学会稳定进化》，内容与 SkillAdam 论文摘要的核心机制一致。
- SkillAdam 论文和 GitHub 均可访问；论文是主要事实来源，GitHub 是工程形态来源。
- 本地存在 `.trae/skills/competitor-analysis/SKILL.md`，它是对话型 Skill，不是独立可执行 Agent。
- 本地 `design-research-agent/run.py` 本轮实际调用后返回 `needs_human_confirmation`，没有生成自动草稿；该调用只留下私有运行事件，没有修改代码或规则。
- 已有手工竞品研究文档 [COMPETITOR-RESEARCH-ai-cockpit-2026-09-29.md](</Users/tianhua/ai-prototype-agent/projects/ai-cockpit-ui-design/COMPETITOR-RESEARCH-ai-cockpit-2026-09-29.md>)，其建议项仍是未确认状态。

### 未确认 / 不应直接外推

- SkillAdam 在论文中的具体 benchmark 提升不能外推到本地竞品分析、需求整理或原型生成。
- 小红书中的“成熟 Agent 都会拥有 Skill CI/CD”是作者推论，不是论文定理。
- 本地尚未测出“编辑预算”对实际 Prompt / Skill 质量的收益。
- 本地还没有固定的竞品分析金测试集，因此当前不能宣称成长闭环已通过。
- EvoAgentBench、MemSkill、Mem2Evolve 等公开研究的 benchmark 结果，不等同于本地业务指标。

### 视频与社区材料的用途

- [Darwin Gödel Machine YouTube](https://www.youtube.com/watch?v=8Odu8BBG7_s)：用于理解 archive / open-ended evolution，不作为定量证据。
- [AlphaEvolve 介绍视频](https://www.youtube.com/watch?v=uPIZC0DG6Q8)：用于理解 evaluator-driven evolution，不替代论文或官方资料。
- 小红书文章：用于理解中文传播和架构启发；性能数字回到论文核验。

## 7. 本轮下一步

当前实现保持 `candidate`，不自动确认长期事实或替换生效版本。第一轮真实项目 baseline 已完成，下一步仍不扩张 Agent 数量或治理范围：

1. 已在隔离副本中实现 `candidate-competitor-skill-001` 的单文件 reviewer 变化。
2. 已对 8 个案例完成候选重排，覆盖 59 条竞品证据；每条都有来源、可借鉴、不要借鉴和 Unknown/not_run 边界。
3. 已完成 paired regression：`pass`，6 个改善、0 个回归、0 个 unknown；桥接评估仍把晋级状态保持为 `candidate`。
4. 已按确认把最小审查规则写回正式 Skill；后续继续观察真实任务，若规则过严或误报，再用新的案例提出下一轮候选。

当前入口级触发和候选结构重跑已验证；剩余工作是人工检查候选边界是否符合本地业务，再决定是否写回正式 Skill。由于 design-research-agent 的普通研究执行仍是人工 MVP，这次重跑不能被解释为新增外部调研。

## 8. 英文术语表

下面只解释本文中有实际含义的英文；链接、文件路径、运行编号和字段名不单独翻译。

### 8.1 架构与流程名词

| 英文 | 中文 | 在本文中的作用 |
|---|---|---|
| Agent | 智能体 / 代理 | 能根据任务动态决定步骤、调用工具并产出结果的执行单元。本文讨论是否需要新的进化 Agent。 |
| Skill | 技能 | Agent 可复用的做事方法、规则或操作说明，通常写在 `SKILL.md`。SkillAdam 直接优化它。 |
| Prompt | 提示词 | 规定模型如何理解任务和输出结果的文本；本文把 Prompt 视为可产生候选版本的资产。 |
| Workflow | 工作流 | 固定的步骤和节点顺序；需求整理、原型交接和竞品分析都属于 Workflow。 |
| Executor | 执行器 | 真正完成任务的 Agent 或程序。SkillOS 的重点是把 Executor 和 Skill 整理者分开。 |
| Curator | 整理 / 筛选器 | 从执行结果中筛选、修订和晋级 Skill 的角色，不直接代替执行任务。 |
| Extractor | 提取器 | 从原文或运行记录提取结构化事实；`Evidence Extractor` 是证据提取节点。 |
| Reviewer | 审查器 | 检查结果是否符合规则；`Competitor Reviewer` 专门检查竞品报告。 |
| Evaluator | 评测器 | 按标准运行测试并给分或给出通过/不通过结论；`Evolution Evaluator` 决定候选是否能晋级。 |
| Brief | 简报 / 交接稿 | 把上下文整理成下一阶段可使用的结构化输入，例如 Prototype Brief、Design Research Brief。 |
| Handoff | 交接 | 把一个阶段的产物、证据和缺口交给下一个 Agent；不是简单复制文本。 |
| Gate | 门禁 | 在阶段之间阻止不满足条件的结果继续流转，例如人工确认 Gate、回归 Gate。 |
| Guardrail | 护栏 / 约束 | 对输入、输出或工具调用施加的安全和范围限制，防止 Agent 越权。 |
| Runtime | 运行时 | Agent 实际启动和执行的环境；本文提到的 runtime gate 会在执行前检查规则和授权。 |
| Registry | 登记表 / 注册表 | 记录有哪些 Agent、Skill、版本或经验，便于定位和追踪。 |
| Adapter | 适配器 | 把一个 Agent 或工具接到统一运行时接口上；本地 `run.py` 就是运行时适配器。 |

### 8.2 进化、评测与版本名词

| 英文 | 中文 | 在本文中的作用 |
|---|---|---|
| baseline | 基线 | 当前版本在固定样例上的结果，所有候选修改都要与它比较。 |
| candidate | 候选 | 尚未确认、不能自动写回生产版本的修改或经验。 |
| confirmed | 已确认 | 经过人工确认、可以进入后续注入或复用的候选。 |
| rejected | 已拒绝 | 被人工或门禁否决，但仍保留原因和证据，便于回溯。 |
| issue | 问题记录 | 记录真实任务中发现的问题，不等同于一句模糊的“效果不好”。 |
| attempt | 尝试 | 针对某个 issue 做过的一次候选修改。 |
| diff | 差异 | 候选版本相对 baseline 改了什么。 |
| edit budget | 编辑预算 | 限制一轮最多改多少内容，避免一次修改范围过大。 |
| rollback | 回滚 | 候选失败或产生副作用时恢复到之前的可用版本。 |
| paired regression | 成对回归 | 同时检查旧用例不能变差、新问题必须改善。 |
| regression | 回归 | 原来通过的任务在改动后失败或变差。 |
| validation | 验证 | 判断候选是否满足结构、事实、行为和质量要求。 |
| verifier | 验证器 | 具体执行验证的规则或程序；比模型自己说“我做对了”更可靠。 |
| benchmark | 基准测试集 | 用固定任务比较不同版本或不同系统。论文里的 benchmark 结果不能直接当成本地收益。 |
| dataset | 数据集 | 一批固定的输入、期望结果或评分样例，用于重复评测。 |
| grader | 评分器 | 对一次运行或一条轨迹按固定标准打分。 |
| metric | 指标 | 可度量的质量维度，例如来源可追溯率、覆盖率、可行动率。 |
| case-level | 案例级 | 逐个任务或案例记录结果，而不是只看整体平均分。 |
| held-out validation | 留出验证 | 不参与候选修改的数据，用来检查候选是否真的泛化。 |
| rollout | 一次完整执行 | 从输入到结果的一次运行过程，常用于收集反馈。 |
| trace | 运行轨迹 | 一次运行中模型调用、工具调用、护栏、交接等步骤的完整记录。 |
| trajectory | 任务轨迹 | 与 trace 接近，强调 Agent 如何逐步完成任务。 |
| feedback | 反馈 | 对执行结果的具体评价，必须能指出哪里好、哪里错、为什么。 |
| critique | 批评 / 改进意见 | 对候选结果的结构化问题分析，通常用来生成下一轮测试或修复。 |
| actionability | 可行动性 | 结论是否能直接转成下一步动作，而不是只有泛泛描述。 |
| coverage | 覆盖率 | 关键竞品、任务、状态或规则是否都被覆盖。 |
| precision | 精确率 | 触发或命中的结果中，有多少是真的相关；例如 Skill 被正确触发的比例。 |
| compliance | 遵循度 | 输出是否遵守 Skill、Prompt 或任务要求。 |
| transfer | 迁移 | 在一个任务或领域学到的能力，能否在另一个任务中继续有效。 |
| overfitting | 过拟合 | 只对测试样例变好，换任务就失效；是自动进化的重要风险。 |
| archive | 版本档案 | 保留多个历史 Agent / Prompt / Skill 分支，而不是只留最新版本。 |
| Pareto frontier | 帕累托前沿 | 保留多个互相取舍的优秀候选，例如一个事实性更强、另一个行动性更强。 |
| mutation | 变异 | 对候选做局部修改。 |
| crossover | 交叉 | 把两个候选的有效部分组合成新候选。 |
| selection | 选择 | 按评测结果保留、淘汰或继续测试候选。 |
| optimizer | 优化器 | 自动提出和筛选修改的机制；SkillAdam 借用了这个概念，但优化的是文字 Skill。 |
| open-ended evolution | 开放式进化 | 不只沿着单一路径改进，而是保留分支并探索不同方向。 |
| self-correction | 自我修正 | 根据失败和批评重新生成或修改资产。 |
| reflection | 反思 | 对刚才的执行进行语言化总结；反思本身不是证据，必须经过后续验证。 |
| episodic memory | 情景记忆 | 按一次次任务保存经验，供后续相似任务检索。 |

### 8.3 研究对象与产品名

| 英文 | 中文 / 所指对象 | 在本文中的作用 |
|---|---|---|
| SkillAdam | 技能稳定进化方法 | 本文的主研究对象：问题历史 + 编辑预算 + 验证后更新。 |
| SkillOpt | 技能优化方法 | 强调有界编辑、留出验证和拒绝编辑缓冲区。 |
| SkillAxe | 技能分析 / 改进方法 | 把 Skill 质量拆成影响、触发精度、指令遵循和路径覆盖。 |
| SkillOS | 技能管理系统方向 | 强调冻结执行 Agent 与 Skill curator 分离。 |
| GEPA | Genetic-Pareto，遗传-帕累托提示词进化 | 用反馈和自然语言反思优化 Prompt，并保留互补候选。 |
| DGM | Darwin Gödel Machine，达尔文-哥德尔机器 | 维护 Agent 版本档案，生成分支并用 benchmark 验证。 |
| EvoAgent | Evolutionary Agent，进化式 Agent | 用变异、交叉、选择自动生成多 Agent 组合。 |
| EvoAgentBench | 进化 Agent 基准 | 测量长期增长、能力迁移、错误避免和技能命中，而不是单次成绩。 |
| MemSkill | Memory Skill，记忆技能 | 研究如何从离线轨迹和真实反馈中构建、进化记忆技能。 |
| Mem2Evolve | Memory to Evolve，记忆驱动进化 | 把轨迹评测、资产记忆和经验记忆放进共同进化循环。 |
| AlphaEvolve | Alpha 进化 | Google DeepMind 的程序 / 算法候选进化系统，核心是自动 evaluator。 |
| Voyager | 航行者 | 通过技能库、自动课程和环境反馈持续完成 Minecraft 任务。 |
| Reflexion | 反思式 Agent 方法 | 把任务反馈转成 verbal reflection，写入 episodic memory。 |
| Self-Refine | 自我精炼 | 同一模型执行 draft → feedback → refine；没有外部验证器时风险较高。 |

### 8.4 机构、工具和研究缩写

| 英文 | 中文 | 在本文中的作用 |
|---|---|---|
| AI | 人工智能 | 总称。 |
| AIOS | AI Operating System，AI 操作系统 | 本地 Agent 体系和治理文档所在的总项目。 |
| LLM | Large Language Model，大语言模型 | 执行 Prompt、生成反馈和提出候选修改的模型。 |
| CLI | Command-Line Interface，命令行界面 | 通过命令调用 Agent 或工具；本地 `run.py` 不是完整 CLI Agent。 |
| CI/CD | Continuous Integration / Continuous Delivery，持续集成 / 持续交付 | 文中“Skill CI/CD”是借用软件工程说法，表示 Skill 也应经过测试、版本和发布门禁。 |
| API | Application Programming Interface，应用程序接口 | 软件之间调用能力的接口。 |
| JSON | JavaScript Object Notation，结构化数据格式 | 文中的 issue / attempt / evaluation 示例使用这种格式。 |
| MVP | Minimum Viable Product，最小可用版本 | 本地竞品 Skill 和 Design Research Agent 目前都属于 MVP 阶段。 |
| RAG | Retrieval-Augmented Generation，检索增强生成 | 先检索资料再生成；本轮明确不为进化机制提前引入。 |
| OpenAI | OpenAI 公司 | 文中用于参考 Agent Evals 评测链路。 |
| Anthropic | Anthropic 公司 | 文中用于参考“先用简单 workflow，不要盲目增加 Agent”的工程建议。 |
| DeepMind | Google DeepMind | AlphaEvolve 的发布方。 |
| GitHub | 代码托管和协作平台 | 用来核验开源项目的 README、代码和工程入口。 |
| Codex | OpenAI 的代码 Agent / 工作台 | SkillAdam 支持的宿主之一。 |
| Claude | Anthropic 的模型和 Agent 产品 | SkillAdam 支持的宿主之一。 |
| Cursor | AI 编程工具 | SkillAdam 支持的宿主之一。 |
| Copilot | GitHub 的代码助手 | SkillAdam 支持的宿主之一。 |
| README | 项目说明文件 | 用于了解 GitHub 项目如何安装、调用和声明能力。 |
| arXiv | 论文预印本平台 | 本文多数论文来源；预印本结论仍需结合本地验证。 |
| ICLR | International Conference on Learning Representations，国际学习表征会议 | GEPA 论文的发表会议信息。 |
| ACL | Association for Computational Linguistics，计算语言学协会 / 会议体系 | Mem2Evolve 论文的发表会议体系。 |
| NeurIPS | Neural Information Processing Systems，神经信息处理系统会议 | MemSkill 项目的会议标注。 |
| SWE-bench | 软件工程 Agent 基准 | DGM 用于验证代码 Agent 改进的 benchmark。 |
| Polyglot | 多语言代码任务基准 | DGM 的另一组代码评测任务。 |
| Minecraft | 我的世界游戏环境 | Voyager 的实验环境，用来检验技能库和长期任务能力。 |
| YouTube | 视频平台 | 文中视频只用于理解系统理念，不作为定量证据。 |

### 8.5 状态和字段

| 英文 | 中文 | 在本文中的作用 |
|---|---|---|
| `candidate` | 候选 | 只可审阅和测试，不能自动进入长期事实层。 |
| `confirmed` | 已确认 | 人工确认后才允许复用或注入。 |
| `not_run` | 未运行 | 没有实测，不能写成通过。 |
| `needs_human_confirmation` | 需要人工确认 | 运行时闸门停车，等待明确的人类确认。 |
| `baseline` | 基线版本 | 候选修改的比较对象。 |
| `promotion` | 晋级 | 决定候选是否从测试状态进入可复用状态。 |
| `human_decision` | 人工决定 | 记录是否由人批准，AI 不能自签。 |
| `rollback_to` | 回滚目标 | 失败时要恢复到哪个版本。 |
| `scope` | 作用范围 | 说明修改只影响竞品分析、需求、原型还是更大范围。 |
| `severity` | 严重程度 | 标记问题优先级，例如 `P1`。 |
| `observed_in` | 首次观察所在运行 | 把问题追溯到具体 `run_id`。 |
| `traceability` | 可追溯性 | 结论能否回到原文、运行记录或人工决定。 |
| `Evidence Register` | 证据登记表 | 记录来源、主张、证据等级、时间和链接，防止把推断写成事实。 |
| `Evidence Extractor` | 证据提取器 | 把论文、竞品页和运行记录整理成结构化证据的能力节点。 |
| `Competitor Reviewer` | 竞品审查器 | 检查竞品证据、可借鉴项和不适用项是否完整、可追溯。 |
| `Evolution Evaluator` | 进化评测器 | 用案例级结果、编辑预算和成对回归判断候选能否送人工确认。 |
| `Evolution Handoff` | 进化交接物 | 将问题、候选改动、评测结果和下一步交给维护者的结构化记录。 |
| `human_review` | 人工复核 | 证据不足或没有明确改进时停住，等待人判断。 |
| `changes_requested` | 要求修改 | 竞品审查发现缺来源、缺边界或缺证据，需要补齐后再评估。 |
| `protected cases` | 受保护案例 | 改动后不得变差的旧案例集合。 |
| `target cases` | 目标案例 | 本轮候选需要改善或验证的新案例集合。 |
| `parent_version` | 父版本 | 候选从哪个当前版本分出来，供比较和回滚。 |
| `evidence_level` | 证据等级 | 标明结论是事实（`fact`）、推断（`inference`）还是未知（`unknown`）。 |
| `event trigger` | 事件触发 | 某个结构化事件出现时立即运行下一节点；本地由有效 `evolution-handoff` 触发，不是定时任务。 |
| `bridge` | 桥接器 | 把一个 Agent 的标准交接物传给另一个 Agent 的明确接口；`bridge.mjs` 不负责晋级，只负责评估和回执。 |
| `event stream` | 事件流 | 按顺序保存问题、候选和评估回执的日志；本地复用项目 `.ai-project/log.jsonl`。 |
| `reply_to` | 回复关联 | 指出评估回执对应哪个 `candidate_id`，让双向关系可以回读。 |
| `project_root` | 项目根目录 | 事件流所属项目的路径；缺少它时自动流程保持 `blocked`，避免只生成单向结果。 |

一句话理解整篇报告：**这些英文不是在建议把系统变复杂，而是在给“Agent 如何安全变好”命名；本地真正要做的是把失败记下来、把候选测清楚、把改动控制住，再由人决定是否写回。**
