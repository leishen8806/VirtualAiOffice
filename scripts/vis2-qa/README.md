# VIS2-Q 隔离验收夹具

独立 QA 用：不修改产品源码，不连真实 Paperclip / 3100 / 3200，不联网。

## 运行

```bash
VIS2_PLAYWRIGHT=/path/to/playwright node scripts/vis2-qa/run.mjs \
  --repo . --label b0 --out docs/dispatch/vis2/qa-b0 --cycles 20
node scripts/vis2-qa/parity-probe.mjs . docs/dispatch/vis2/qa-b0
```

`run.mjs` 会：

1. 在独立 worktree 里写入假公司 `company-id.txt`、假 `workhours.json`、`lan.json`（关闭）、`wall.json`（关闭）；
2. 启动**模拟 Paperclip**（随机 127.0.0.1 端口，全部 GET 返回假数据并记录请求）；
3. 用 `block-network.mjs` preload 阻断一切非本机白名单端口的 `fetch`（外部天气 API 会被阻断并记账）；
4. 用随机端口启动 `office3d/server.mjs`，Playwright（本机只读依赖）开 Chromium 加载 4 个场景；
5. 采集请求、console、renderer/场景计数、rAF 帧间隔、20 轮独立加载生命周期、服务端 RSS、截图（标签显示 / 隐藏）；
6. 输出 `run.json` / `measurements.json` / `report.md` / `logs/` / `screenshots/`。

`parity-probe.mjs` 只读二维调度台、园区调度屏、中控大屏共用的 `dr-demo-snapshot.js` 纯函数，固定 `elapsedMs` 比较 KPI / 运单 / 事件 / 时间，并覆盖 0、负数、NaN、Infinity、跨分钟/小时。

## 边界

- 本夹具只对 **B0 基线（当前 worktree 提交）** 负责；候选 C0 必须另开 worktree、用同一夹具重跑，旧报告不能为 C0 背书。
- `office3d` 的办公室 / 仓配功能开关在 B0 中不存在（B0 只有 URL `place/layout` 选择），Q1 的开关矩阵只能在候选提供后执行。
- 参考包 `office-target/current`、`campus-target/current` 不在仓库与快照中，Q4 视觉结论只能 REVIEW_REQUIRED / NOT_RUN。
- 性能只代表本机 Chromium + SwiftShader/ANGLE 环境，不是 4K/60fps 或目标硬件裁决。
