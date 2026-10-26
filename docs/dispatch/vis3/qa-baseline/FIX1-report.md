# VIS3-TEST-001-FIX1 最终修复报告（中文）

- 被评审提交：`eec5ea6db38f149d485c13a58cee0ed40110e133`（评审 CHANGES_REQUIRED；**原提交保留未改写**）
- 修复分支：`qa/vis3-test-infra`（增量提交）
- 被测应用 SHA（与框架 SHA 分开记录）：
  - office / dashboard：`main` @ `2f022fe6e9bc4d5444602a1c2a3a5a68cdd9972a`
  - DR 仓配：`integration/vis2-dr-rc1` @ `e988a864b180…`（短 `e988a86`）

## T-01 ~ T-12 处置表

| 项 | 处置 | 关键实现 |
|---|---|---|
| T-01 文件系统隔离 | **修复** | `fixture.mjs` 先 `fs.cpSync(office3d)` 到 `os.tmpdir()` 自建沙箱再注入配置；`--out` 必须位于临时目录、拒绝删除已存在非空目录、拒绝写入被测仓库；仅清理自建目录；启动前校验绝对路径与 `office3d/server.mjs` |
| T-02 退出码 | **修复** | 0/1/2 显式语义；强制检查计数入库；`--repo` 不可读 → 退出 2 |
| T-03 生命周期 | **修复** | 等待 scene 真实就绪；office 同页 `#enter/#exit` 10 轮、dr 同 `page.goto` 复用同页；页面可见性冻结（CDP `Page.setWebLifecycleState`）下 RAF 增量 < 15 才通过；重复 RAF 循环检测 |
| T-04 跨平台/确定性 | **修复** | `--import` 用 `pathToFileURL(...).href`；穿梭机断言改确定性 `?campusMotion=0`（墙钟运动仅观察）；记录 seed/画质/相机/视口 |
| T-05 网络隔离 | **修复** | 浏览器按精确 origin+端口允许清单；其它 localhost（含 3100/3200）与外部传输前 `route.abort()`；`serviceWorkers:'block'`；`context.on('websocket')` 拒绝非允许源；未授权 POST 目标服务器 0 命中 |
| T-06 运行时异常 | **修复** | 每场景收集 `pageerror`+`console.error`，强制 `no-runtime-errors`；注入异常被检出 |
| T-07 场景断言 | **修复** | 就绪/正确场景/模型存在/`userData.dynamic`/透明度 0.28/静态合并防重复/看板指标/演示标注；就绪超时判失败 |
| T-08 性能测量 | **修复** | 从 `performance.getEntriesByType('navigation')[0]` 起点测加载；office/dashboard/dr 各自真实采样（loadMs、p50/p95、calls、tris、geometry/texture） |
| T-09 渲染环境 | **修复** | 检测 `SwiftShader/llvmpipe/software` 标 `softwareRenderer`；无浏览器/GPU 时 NOT_RUN；能力缺失 → 退出 2 |
| T-10 功能开关 | **修复** | `--scene flags` 跑 6 组（缺失/损坏/false/仅 office/仅 campus/两者）fail-closed 矩阵；禁用态与启用态分开 |
| T-11 结构化报告 | **修复** | `report.json` 由实际输出生成，含 SHA、强制计数、逐场景 checks；无手写冲突副本 |
| T-12 复现工件 | **修复** | 截图/日志写 `--out`（不提交大二进制）；`selfcheck.mjs`、`run.mjs` 等脚本入库 |

## 变更文件

- `scripts/vis3/fixture.mjs`（修改）
- `scripts/vis3/run.mjs`（修改）
- `scripts/vis3/selfcheck.mjs`（新增）
- `docs/dispatch/vis3/qa-baseline/FIX1-report.md`（本报告）

未改：`block-network.mjs`、`mock-paperclip.mjs`、`instrument.mjs`、任何产品应用代码。

## 测试命令与结果

```bash
VIS3_PLAYWRIGHT=/path/to/playwright node scripts/vis3/run.mjs --repo . --scene office,dashboard --out /tmp/vis3/fix-final/main
VIS3_PLAYWRIGHT=/path/to/playwright node scripts/vis3/run.mjs --repo <rc1 worktree> --scene dr --out /tmp/vis3/fix-final/dr
VIS3_PLAYWRIGHT=/path/to/playwright node scripts/vis3/run.mjs --repo <rc1 worktree> --scene flags --out /tmp/vis3/fix-final/flags
node scripts/vis3/selfcheck.mjs
```

| 运行 | 退出码 | 强制检查 | 结果 |
|---|---|---|---|
| office + dashboard（main） | 0 | 13/13 | PASS（office loadMs 84ms；dashboard loadMs 51.7ms） |
| dr（RC1） | 0 | 13/13 | PASS |
| flags（RC1） | 0 | 3/3 | PASS（6 组 fail-closed） |
| 未修改提交代码（上述三组） | — | — | 全部通过（非诊断补丁） |

## 退出码实测

| 条件 | 退出码 |
|---|---|
| 全部强制检查通过（office+dashboard、dr、flags） | 0 |
| 突变：重复 RAF 循环 / 运行时异常 / 未授权端口 POST | 1 |
| 不可读仓库 `--repo /nonexistent-repo` | 2 |
| `--out` 已存在且非空 | 2 |

## 突变测试结果（诊断用临时补丁，未改产品代码）

| 突变 | 退出码 | 检出证据 |
|---|---|---|
| L1 重复动画循环 | 1 | `office-no-duplicate-loop`（raf Δ=251/s） |
| L2 浏览器运行时异常 | 1 | `office-no-runtime-errors-2`（pageerror `VIS3_MUT_RUNTIME`） |
| L5 未授权端口 POST（127.0.0.1:3199） | 1 | 阻断 + 3199 服务器 0 命中（传输前拦截） |
| 干净基线（无注入缺陷） | 0 | 仅当强制检查真实通过才 0 |

## 隔离证明

- 文件系统：修复后测试前后 `git status --porcelain` 一致；DR 工作树旧版残留已恢复；`--out` 拒绝覆盖已存在非空目录。
- 网络：mock 写请求 0；浏览器外部请求 0；`blocked-network.jsonl` 仅天气 API 阻断；未授权 localhost 端口传输前 `route.abort`，目标服务器 0 命中。

## Windows 兼容性

- 代码层：`--import` 已用 `pathToFileURL`；未用 shell；路径处理走 `node:path`。
- **真实 Windows 未在本机执行**（当前 macOS）→ Windows 实测 **NOT_RUN**，留待 Windows 环境复核。

## 性能测量局限

- 本机 Apple ANGLE Metal、Chromium 156；数字只代表本机（DR：p50 16.7ms / p95 16.8ms @1280×720 DPR1；calls 181；tris 122,499；geometry 324 / texture 52）。
- 不据此宣称 4K/60fps 或目标 GPU；`softwareRenderer` 自动标记软渲染环境。

## 剩余缺陷与 NOT_RUN

- 真实 Windows/其它浏览器/4K/目标 GPU：NOT_RUN。
- 视觉符合参考图（office/campus 参考包缺失）：REVIEW_REQUIRED。
- 四席中控 / DR 接待 / 品牌（RC1 门禁排除 B/B1）：未执行。
- 办公室样板性能采样已补，但 `office-vis2` 预览的非渲染器路径（业务写）不在本框架范围内。

## 独立复审请求

本修复仅提交 harness 所有测试代码与文档，未修改生产应用代码、未合并 main、未部署。请 Claude Opus 5.5 独立复审是否可作为 VIS3 质量门禁；harness 不自我批准。
