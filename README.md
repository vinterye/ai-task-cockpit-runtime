# AI Task Cockpit Runtime

AI 任务执行驾驶舱的可运行 MVP：用统一的“左侧对象树 → 右侧详情”展示七阶段任务，并把真实 Node、Artifact、Master Controller Review 和 Runtime Event 串成可回读闭环。

## 当前能力

- 真实任务生命周期：`pending → running → waiting_review → approved → completed`
- 03 交互、06 开发、07 测试 Worker 的本地注册入口
- Artifact 证据：`artifact_id`、`path`、`fingerprint`、`exists`
- Master Controller：独立 `controller_called` Event、审核轮次和三轮人工门
- Requirement / Competitor 结构化文档节点
- `/api/v1` 兼容响应包，保留旧 `/api` 路由
- 完整 Run / Event 详情和持久化 Runtime 状态

## 启动

```bash
node server.mjs
```

浏览器打开 `http://127.0.0.1:3000/`。

## 验证

```bash
node --check server.mjs
node --test tests/controller-review-rounds.test.mjs tests/stage-worker-runtime.test.mjs tests/requirements-gate-contract.test.mjs
```

## 竞品分析边界

`docs/competitor-analysis.md` 是当前项目的结构化分析基线。正式外部竞品研究必须通过 `competitor-evidence/v1` 证据包提供每个竞品的官网、GitHub、YouTube 来源；缺少来源时系统保持 `blocked` / `unknown`，不把模型常识当成事实。

## 目录

- `server.mjs`：Runtime API 与 Master Controller 闭环
- `总控交互原型.html`：驾驶舱页面
- `scripts/`：本地 Runner 与阶段 Worker
- `docs/`：API、需求、竞品和 Agent 适配契约
- `tests/`：Runtime 回归测试

