# VIS3-TEST-001：Three.js 视觉回归 + 运行时性能测试框架

可复用浏览器测试框架，服务 Codex 的 VIS3 设计里程碑，不改 Codex 拥有的实现文件。

## 前置条件

- Node ≥ 20；本机只读 Playwright 依赖（`VIS3_PLAYWRIGHT` 环境变量或 `--playwright` 指向可加载的 `playwright`）。
- Chromium（默认 `channel: 'chrome'`；无浏览器/GPU 时相关用例标记 `NOT_RUN`，不伪造 PASS）。
- 隔离运行：框架用 mock Paperclip、随机本机端口、`block-network` 阻断外网；只写假公司/假配置与证据目录，不改产品源码。

## 执行命令

```bash
# 办公室样板 + 桌面看板（在 main/合并分支工作树）
node scripts/vis3/run.mjs --repo . --scene office,dashboard --out docs/dispatch/vis3/qa-baseline/main

# DR 仓配/仓库（在集成候选工作树，例如 integration/vis2-dr-rc1）
node scripts/vis3/run.mjs --repo <候选工作树> --scene dr --out docs/dispatch/vis3/qa-baseline/dr

# 可选：固定 DPR 与视口（默认 1 / 1280x720）
node scripts/vis3/run.mjs --repo . --scene office --dpr 1 --viewport 1920x1080 --out ...
```

每次运行输出：`report.json`、`screenshots/*.png`、`logs/`（server / mock-requests / blocked-network）、`pixel-colors.json`（另用 `python3`+Pillow 生成）。

## 框架文件

| 文件 | 作用 |
|---|---|
| `scripts/vis3/block-network.mjs` | preload：只放行白名单本机端口，外网/真实 3100/3200 一律阻断并记账 |
| `scripts/vis3/mock-paperclip.mjs` | 只读 mock 上游，记录全部请求 |
| `scripts/vis3/fixture.mjs` | 隔离运行夹具：假公司/开关/随机端口，启动 office3d server |
| `scripts/vis3/instrument.mjs` | 浏览器注入：统计 RAF / interval / timeout / fetch / canvas |
| `scripts/vis3/run.mjs` | 场景执行器：固定视口/DPR、固定相机、性能采样、生命周期、断言 |

## 固定条件（视觉回归口径）

- 视口默认 1280×720、DPR 1；可 `--viewport/--dpr` 覆盖并在报告记录。
- 相机：DR 用 `window.__office.setGoal` 固定机位（cutaway / 货架 / 穿梭机）；office 用预览内建机位（overview / reception / bar）。
- 画质：DR `?q=high|low`；`?campusMotion=0` 用于静止基线。
- 时间/种子：DR 穿梭机由既有 `shuttleFrame` 演示时钟驱动（框架记录采样条件）；office 样板固定 seed。
- 截图是真实浏览器输出，不是 AI 生成参考图。

## 未来 Codex 提交的测试流程

1. `git fetch origin --prune`；核对候选分支与完整 SHA。
2. 在干净 worktree 检出该 SHA（`git worktree add --detach <dir> <fullSHA>`），不要用开发者的本地文件夹或未提交文件。
3. 用本框架对同一 `--scene` 运行，`--out` 指向新目录。
4. 与既有基线目录逐项对比：`report.json` 的 checks、截图（人工/Pillow 颜色统计）、`perf`（loadMs / frames / rendererInfo / gpu）、`lifecycle`、`mockWrites`/`blockedNetwork`。
5. 新增失败按「新回归 / 基线已存在 / 无法复现 / 未执行」分类；不删测试、不 skip、不弱化断言、不以退出码 0 冒充完整覆盖。
6. 无浏览器/GPU 时标记 `NOT_RUN`，不做 PASS。

## 所有权与边界

只新增测试/夹具/工具与证据，不改产品渲染器、业务 API、共享加载器、Codex 视觉组件；不合并、不 push main、不部署、不批准上线。
