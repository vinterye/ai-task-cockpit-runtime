# AIOS 驾驶舱改造 V1 需求文档

## 1. 文档信息

- **版本**：V1
- **主题**：主界面骨架 + 7 阶段工作流
- **适用文件**：
  - `总控交互原型.html`
  - `server.mjs`
  - `runtime/state.json`
  - `scripts/mvp-runner.mjs`
- **目标**：在保留 Real MVP 0.1 真实运行链路的前提下，建立任务列表、当前任务工作区和 7 阶段主线。

## 2. 本轮范围

本轮只实现：

1. 左侧任务列表
2. 中间当前任务工作区
3. 当前任务的 7 阶段主线
4. 阶段切换
5. 阶段核心卡片基础展示
6. 与现有 Real MVP 0.1 Runtime 兼容

本轮不实现：

- 复杂右侧 Drawer
- 文档树
- 模块级修改
- Agent 自动路由
- 创建任务新表单
- 版本对比
- Challenger
- 自动 Controller
- 完整开发/测试详情

## 3. 现有实现保护要求

不得推翻现有结构。Real MVP 0.1 的真实生命周期必须继续成立：

```text
pending → running → stdout → artifact → waiting_review → approve → completed
```

必须继续保留并可用：

- `POST /start`
- `POST /review`
- 真实 `child_process.spawn()`
- stdout / stderr 捕获
- artifact 生成与检查
- API 拉取与轮询

失败 Runner 也必须继续成立：

```text
exit code 1 → 不生成成功 artifact
```

## 4. 数据真实性约束

页面任务状态必须继续来自：

```text
server.mjs + runtime/state.json + API
```

不得重新使用 `tasksData` 作为任务真实数据源。

当后端没有证据时：

- 数量、版本、完成状态显示 `Unknown / 尚无证据` 或 `Pending`
- 不得为了视觉效果虚构阶段完成、文档版本、数量或进度

服务未连接时必须显示：

```text
本地运行服务未连接
```

不得伪造成 Running 或 Completed。

## 5. 主界面结构

主界面由三层组成：

```text
左侧：任务列表
中间上方：当前任务 + 7 阶段主线
中间主体：当前选中阶段的核心产物卡片
```

### 5.1 左侧任务列表

左侧只负责展示：

- 任务集合
- 当前选中的任务
- 任务当前状态
- 任务当前阶段
- 任务总体进度

左侧不得放置 7 个阶段。点击任务只切换当前任务，不打开右侧弹框。

支持状态：

```text
Pending
Running
Waiting Review
Blocked
Completed
Failed
```

单个任务至少展示任务名称、阶段/模块摘要、状态和进度；没有证据的字段显示 `Unknown / 尚无证据` 或 `Pending`。

### 5.2 中间顶部 7 阶段

每个任务固定拥有以下阶段，并横向展示：

| 顺序 | 阶段 ID | 名称 |
|---|---|---|
| 01 | `competitor` | 竞品分析 |
| 02 | `requirement` | 需求文档 |
| 03 | `interaction` | 交互设计 |
| 04 | `prototype` | 原型 |
| 05 | `ui` | UI 设计 |
| 06 | `development` | 开发 |
| 07 | `testing` | 测试验收 |

阶段状态图例：

```text
✓ Completed
● Running
◷ Waiting Review
! Blocked
○ Pending
× Failed
```

空间不足时允许横向滚动，不得把文字压缩到不可读。

### 5.3 阶段切换

点击阶段只切换中间主体的内容，不打开阶段 Drawer，不改变后端 `task.currentStage`。

## 6. 阶段核心卡片

所有卡片至少展示：

- 类型
- 标题
- 一句摘要
- 状态
- 版本（仅在真实数据存在时显示）

无真实数据时显示 `Pending` 或 `Unknown / 尚无证据`。

各阶段基础卡片如下：

### 01 竞品分析

- 原始需求输入
- 精品交互拆解
- 竞品差异化矩阵

### 02 需求文档

- 正式需求文档
- MVP 范围
- 验收标准

### 03 交互设计

- 用户主路径
- 页面框架
- 交互框架演示

### 04 原型

- Framework
- Module
- Prototype Preview

### 05 UI 设计

- Low-Fi Demo
- UI 设计文档
- 页面任务

V1 暂不实现动态 Demo Grid。

### 06 开发

- Technical Contract
- 开发模块
- Integration

V1 暂不拆分动态前后端 Module。

### 07 测试验收

- Test Plan
- Module Test
- Regression
- E2E Demo
- Final Acceptance

## 7. Runtime 信息区

7 阶段主线下方继续保留当前 Real MVP 执行信息，至少展示：

- 当前 Task ID
- Runtime 状态
- 连接状态
- stdout / stderr 日志
- artifact 证据
- `waiting_review` 状态
- 现有 Approve 操作

Runtime 状态与阶段状态暂时分离：

- Runtime Status：来自真实进程生命周期
- Stage Status：来自 workflow 数据
- 不得因单个 Runtime Task 完成而自动将 7 个阶段全部标记为完成

## 8. state.json 可选扩展

只有确有需要时，允许在现有状态结构上新增可选 `workflow` 字段，不得破坏既有 Runtime 字段：

```json
{
  "workflow": {
    "current_stage": "interaction",
    "stages": []
  }
}
```

Stage 对象可包含：

```json
{
  "id": "interaction",
  "name": "03 交互设计",
  "status": "running",
  "cards": [
    { "id": "user-flow", "title": "用户主路径", "status": "pending" },
    { "id": "page-framework", "title": "页面框架", "status": "pending" },
    { "id": "interaction-demo", "title": "交互框架演示", "status": "pending" }
  ]
}
```

没有 workflow 证据的阶段必须显示 `Pending / Unknown`。

## 9. 响应式要求

- 桌面端优先
- 左侧任务栏保持合理固定宽度
- 中间工作区自适应
- 7 阶段主线可横向滚动
- 保持文字可读性

## 10. Drawer 与后续能力边界

V1 不实现复杂 Drawer。卡片点击可以保留现有交互或展示简单详情，但不新增以下能力：

- 文档树
- 父子 Scope
- 修改 Composer
- Agent 自动路由
- 版本历史
- 完整 Review Tab

## 11. 验收标准

### Case 1：真实连接与任务列表

打开页面后显示 Server Connected，左侧任务列表来自真实 API。

### Case 2：任务切换

点击左侧不同任务，中间任务信息正确切换。

### Case 3：阶段切换

点击 7 个阶段，当前阶段主体正确切换。

### Case 4：阶段卡片

每个阶段显示对应的核心卡片框架。

### Case 5：无证据状态

没有真实数据的阶段显示 `Pending / Unknown`，不得伪造成完成。

### Case 6：Real MVP 0.1 回归

完整跑通：

```text
pending → running → stdout → artifact → waiting_review → approve → completed
```

### Case 7：失败 Runner 回归

Runner 返回 exit code 1 时，不生成成功 artifact。

## 12. 完成定义

V1 完成需满足：

- 左侧任务列表结构正确
- 中间当前任务结构正确
- 7 阶段主线存在
- 阶段可切换
- 各阶段核心卡片存在
- 无真实数据时使用 `Unknown / Pending`
- Real MVP 0.1 不被破坏

V1 不以 Drawer、文档树、修改路由或创建任务功能完成作为验收条件。

## 13. 明确停止范围

完成 V1 后停止，不自行实现 V2，不顺手增加：

- 文档树
- 修改路由
- Agent Controller
- 大范围 server 重构
- 大量新增 API

## 14. 交付汇报项

完成后只汇报：

1. 修改文件
2. 左侧任务列表变化
3. 7 阶段实现方式
4. 各阶段卡片
5. `state.json` 是否新增字段
6. 是否继续完全使用真实 API / Runtime 数据
7. Real MVP 0.1 验证结果
8. 失败 Runner 验证结果
9. 仍为 Unknown / Pending 的内容
10. 未实现的 V2 内容
11. 未提交 commit
12. 未发布云端

## 15. V1 实际执行记录（2026-10-06）

| 验收项 | 结果 | 证据 |
|---|---|---|
| 真实连接与任务列表 | Passed | 浏览器显示“本地运行服务已连接”，任务来自 `/api/projects` |
| 七阶段主线 | Passed | `stagesMeta` 固定渲染 01～07，主线可横向滚动 |
| 阶段切换 | Passed | 点击“交互设计”后显示“正在查看：03 交互设计”，后端真实阶段仍为“07 测试验收” |
| Runtime / Stage 分离 | Passed | Runtime 完成后节点有真实状态，`task.stages` 无 workflow 证据时仍为 `Pending` |
| Real MVP 0.1 | Passed | `pending → running → stdout → artifact → waiting_review → approve → completed` |
| 失败 Runner | Passed | `MVP_RUNNER_FAIL=1` 返回 exit code 1，成功 artifact 不存在 |

V1 当前仍将没有 workflow 证据的阶段和卡片显示为 `Pending / Unknown`；V2 及后续 Drawer、文档树、修改路由不纳入本轮验收。
