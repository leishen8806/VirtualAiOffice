# VIS2-Q b0 基线采集报告

- 采集时间：2026-10-23T04:38:00.440Z
- 提交：`cbddb9fa3b874f7f56c8410928a8edd23013795c`（独立 worktree，非生产工作目录）
- 环境：darwin/arm64、Node v22.22.1、Chromium 156.0.8078.47
- 服务：office3d 临时端口 54754，Paperclip 模拟端口 54753，假公司 `fixture-company-0001`
- 网络：preload 只放行两个本机端口；浏览器侧外部请求全部 abort

## Q0 隔离与证据

| 项 | 结果 |
|---|---|
| 外部网络请求（服务端） | 4 条被阻断：https://api.open-meteo.com/v1/forecast、https://api.rainviewer.com/public/weather-maps.json |
| 外部网络请求（浏览器） | 0 条被阻断 |
| 真实 Paperclip 请求 | 0（所有上游请求都到 127.0.0.1:54753） |
| 上游写请求 | 0 次（期望 0） |
| 浏览器 console error/warning | 0 条（详见 logs） |

## 场景加载与性能（本机 Chromium，非最终性能裁决）

| 场景 | 状态 | 指标 |
|---|---|---|
| office-default | LOADED | canvas=2 calls=329 tris=57508 p50=16.7ms p95=16.8ms |
| office-layout3 | LOADED | canvas=2 calls=60 tris=69583 p50=16.7ms p95=16.8ms |
| warehouse-dr | LOADED | canvas=2 calls=58 tris=33920 p50=16.7ms p95=16.8ms |
| warehouse-control-room | LOADED | canvas=2 calls=126 tris=68040 p50=16.7ms p95=16.8ms |

截图：`screenshots/*.png`（标签显示 / 隐藏各一组）。参考包缺失，视觉结论 **NOT_RUN / REVIEW_REQUIRED**。

## Q2 生命周期（20 轮独立加载）

- canvas 数序列：2
- 服务端 RSS（KB）首/末：161536 / 175296
- 每轮 RAF/timer 见 run.json；基线加载无跨文档残留（页面关闭即销毁），候选的开关切换生命周期 **NOT_RUN**。

## Q3 二维/三维共享快照（B0 既有单测 + 独立探针）

- tests/dr-console-data.test.mjs: exit=0
- tests/dr-console-dynamic.test.mjs: exit=0
- tests/campus-layout.test.mjs: exit=0
- `parity-probe.json`：固定 elapsedMs（0、1、1799、1800、3600、90000、3600000、-5、NaN、Infinity）下，二维调度台 / 园区调度屏 / 中控大屏的 KPI、运单、事件、generatedAt **逐项一致，10/10 PASS**；负数 / NaN / Infinity 归一化到 tick 0，无 NaN/undefined。

## Q1 / Q4 未执行原因

- q0_isolated: true
- q1_feature_matrix: NOT_RUN（B0 无办公室/仓配功能开关配置文件；候选 C0 未提供）
- q2_lifecycle: PARTIAL（20 轮页面加载，非候选开关的进入/退出切换）
- q3_parity: PARTIAL（B0 共享快照单测；候选 2D/3D 映射未提供）
- q4_visual: NOT_RUN（参考包 office-target/current、campus-target/current 未提供；截图仅作证据）
- q4_perf: PARTIAL（本机 Chromium 采样，无 Trae 冻结预算，不能宣称 4K/60fps）
- browser_compat: PARTIAL（仅本机 Chromium）

## 结论边界

本报告只覆盖 **B0 基线（b0）**；候选 C0 未提供，任何候选相关结论均未生成。没有参考包与 Trae 冻结预算时，视觉与 4K/60fps 不做 PASS 判定。
