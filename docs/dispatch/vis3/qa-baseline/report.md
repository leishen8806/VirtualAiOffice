# VIS3-TEST-001 基线报告（中文）

- 报告时间：2026-10-23；环境：macOS arm64、Node v22.22.1、Chromium 156（ANGLE Metal，Apple GPU）。
- 框架分支：`qa/vis3-test-infra`；只新增测试/工具/证据，未改产品源码。

## 基线 SHA

| 场景 | 固定 SHA | 来源 |
|---|---|---|
| 办公室样板 + 桌面看板 | `2f022fe6e9bc4d5444602a1c2a3a5a68cdd9972a`（短 `2f022fe`） | `origin/main`（已合并 Trae 办公室样板 PR#37） |
| DR 仓配/仓库 | `e988a864b180…`（短 `e988a86`） | `origin/integration/vis2-dr-rc1` 最新 |

## 测试结果（可执行命令见 `../README.md`）

| 场景 | 结果 | 断言数 | 关键证据 |
|---|---|---|---|
| 办公室样板（overview/reception/tea-bar/logo 正常与降级） | **PASS** | 3/3 | `office-overview.png`、`office-reception.png`、`office-tea-bar.png`、`office-overview-fallback.png` |
| 桌面看板（dr-console.html，KPI/演示标注/无错误/无写） | **PASS** | 4/4 | `dashboard-desktop.png`；请求 14、写 0 |
| DR 仓配（cutaway 高/低、货架、穿梭机、无重复、生命周期、无写） | **PASS** | 13/13 | `dr-cutaway-high/low.png`、`dr-rack-close.png`、`dr-shuttle-wheel.png` |

## DR 运行时性能（实测，非自报）

| 指标 | 值 |
|---|---|
| 场景加载 | 8 ms（本机隔离服务，非生产首屏） |
| 帧间隔 p50 / p95 / max | 16.7 / 16.8 / 16.8 ms（≈60 FPS @1280×720 DPR1） |
| draw calls | 181 |
| 三角形 | 122 499 |
| geometry / texture | 324 / 52 |
| GPU | ANGLE（Apple, ANGLE Metal） |
| 生命周期（8 轮进出） | canvas 恒 2、campus-root ≤1、无重复根 |
| 写请求 / 新轮询 | 0（mock 写 0；外网阻断 4 条、浏览器外部 0） |

## 覆盖与限制（如实）

- **已覆盖**：视觉回归截图与结构断言；DR 运行时性能；生命周期（进入/退出、campusMotion 静止、低画质、功能开关失败关闭）；logo 正常/降级；桌面看板布局；无新业务写/轮询。
- **NOT_RUN / 未覆盖**：
  - 办公室样板的性能采样未纳入（`office-vis2` 预览页未走本框架 `collect()` 的 `window.__office` 路径，本次只做视觉/logo/生命周期；后续补）。
  - 四席中控 / DR 接待 / 品牌展示：DR 集成候选（RC1）门禁排除了 Claude B/B1，场景无这些对象，相关断言未执行。
  - 4K/60fps 与目标 GPU（Windows RTX 等）未验证：本机为 Apple ANGLE Metal，数字只代表本机。
  - 视觉符合参考图：无 office/campus 参考包，截图仅结构证据，视觉结论 **REVIEW_REQUIRED**。
  - 其它浏览器 / Windows：未执行。

## 后续 Codex 提交复测

按 `../README.md` 的六步流程；对每个新 SHA 重新产出 `report.json`+截图+perf，并与本基线逐项对比；无浏览器/GPU 时标 NOT_RUN。
