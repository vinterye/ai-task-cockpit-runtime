# Cockpit API v1

## 统一响应包

所有 `/api/v1/*` 响应使用：

```json
{
  "data": {},
  "meta": {
    "schema_version": "cockpit-api/v1",
    "request_id": "REQ-...",
    "source": "runtime",
    "generated_at": "2026-10-07T00:00:00.000Z"
  },
  "error": null
}
```

旧 `/api/*` 保持原响应形状。

## 任务与阶段

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/v1/tasks` | 创建任务 |
| GET | `/api/v1/tasks/:task_id` | 读取任务、阶段和节点状态 |
| POST | `/api/v1/tasks/:task_id/start` | 启动 Runtime |
| POST | `/api/v1/tasks/:task_id/pause` | 暂停 Runtime |
| POST | `/api/v1/tasks/:task_id/resume` | 恢复 Runtime |
| GET | `/api/v1/tasks/:task_id/stages/:stage_id/tree` | 读取阶段结构树 |
| GET | `/api/v1/tasks/:task_id/nodes/:node_id` | 读取节点详情 |
| POST | `/api/v1/tasks/:task_id/nodes/:node_id/review` | 请求 Master Controller 审核 |
| POST | `/api/v1/tasks/:task_id/nodes/:node_id/revise` | 创建范围化返工请求 |
| POST | `/api/v1/change-requests/:change_request_id/apply` | 应用返工请求并重新启动任务 |

## 运行证据

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/tasks/:task_id/events` | 读取完整事件链，可按 `stage_id`、`node_id`、`action`、`type` 过滤 |
| GET | `/api/v1/tasks/:task_id/runs/:run_id/events` | 读取单次执行事件链 |
| GET | `/api/v1/tasks/:task_id/artifacts` | 读取任务 Artifact，包含阶段 Worker Artifact |
| GET | `/api/v1/tasks/:task_id/artifacts/:artifact_id` | 读取指定 Artifact |
| GET | `/api/v1/artifacts/:artifact_id/manifest` | 读取 Artifact 证据清单 |
| GET | `/api/v1/tasks/:task_id/reviews` | 读取审核记录、Controller ID、review round |

## 阶段 Worker 输出

```json
{
  "schema_version": "stage-agent-result/v1",
  "task_id": "TASK-...",
  "run_id": "RUN-...",
  "stage_id": "interaction|development|testing",
  "node_id": "interaction.overview",
  "agent_id": "interaction-agent",
  "status": "completed",
  "structured_content": {},
  "artifact_refs": [{
    "artifact_id": "artifact-...",
    "path": "runtime/artifacts/...",
    "fingerprint": "sha256:...",
    "exists": true
  }],
  "evidence_refs": [],
  "validation": {"status": "ready", "missing": [], "unknown": []}
}
```

## Runtime 门禁

成功 Node 的事件顺序必须为：

```text
node_started
node_stdout / node_stderr
artifact_created
node_finished
review_requested
controller_called
controller_decision_received
review_applied
task_completed
```

`controller_called` 必须携带 `agent_id / task_id / node_id / execution_id / review_round`；首次审核固定 `review_round=1`、`max_review_rounds=3`。

`unknown`、`not_run`、`blocked` 不得映射成 `completed`。

Review 记录必须同时返回 `review_round / max_review_rounds`，并在 `artifact` 中返回 `artifact_id / path / fingerprint / exists`；没有证据时返回 `null`，不能写成“已完成”。
