# VIS2-Q-R3 独立 GitHub 基线 QA 报告（中文）

- 报告时间：2026-10-23（本机 macOS arm64，Node v22.22.1，Chromium 156）
- 仓库：`git@github.com:leishen8806/VirtualAiOffice.git`
- QA 分支：`qa/vis2-q-r3`（基于集成候选，只新增 QA 测试/证据，不改产品源码）

## 1. 已同步并核对的 GitHub 分支与完整 SHA

| 角色 | 分支 | 完整 SHA | 说明 |
|---|---|---|---|
| 集成候选（本次主要测试对象） | `integration/vis2-dr-rc1` | `11680792f67f40efb1f1f15c4ba0f09591079636` | 冻结 RC1，含 Trae R1/R2 公共基础 + Claude A-FIX1，B/B1 被门禁排除 |
| RC1 直接父提交 | — | `a2334fef4598101ab9ff63a60ef319f96b3304f3` | |
| RC1 声明的 B0 | `9e8c4f99ea29166b173d40a762178b9933c972ca` | 同左 | RC1 文档 `00-baseline.json` 的 B0 |
| 早前快照基线 | `office3d/rev-20261023-2` | `cbddb9fa3b874f7f56c8410928a8edd23013795c` | 仅作历史对照 |
| Trae 办公室样板（最新） | `vis2/o-office-sample` | `eee77accb1270b2dcec2042f84b1ec1dccf5e02e` | 已合并进 `main`（`2f022fe`），未进 RC1 |
| 最新 main | `main` | `2f022fe`（`f88ebc4` → `2f022fe`） | 合并了 Trae 办公室样板 PR#37 |
| Claude A-FIX1（组件） | `vis2w/rack-cell-a-fix1` | `7b35a26d719a01b735caa3c76b7b2761ee3ff10f` | 依赖 `f7d782a`；已含于 RC1 |
| Claude B | `vis2w/dispatch-suite-b` | `410707dbd001d443e68db3dd85ee85032838053e` | 被 RC1 门禁阻断，未进集成 |
| Claude B1 | `vis2w/dispatch-suite-b1` | `f9d296ef5afeae3971a0ab22a65339c18e1c2332` | 被 RC1 门禁阻断，未进集成 |

已读取的既有 QA/复审记录：`docs/dispatch/vis2/{00..04}`、`office3d/docs/vis2-o/{B0,LOGO,REPORT}.md`、`office3d/docs/dr-vis2-rack-cell.md`（FIX1 版）、`office3d/docs/dr-vis2-bb1-contract-audit.md`、既有 QA 分支 `qa/vis2-b0`、`qa/vis2-q-a-2879124`。本次针对**新 SHA** 执行，避免重复旧 SHA 结论。

## 2. 执行环境与隔离

- 独立 worktree：`rc1-1168079`（HEAD=RC1）、`b0-9e8c4f9`、`afix1-7b35a26`、`office-eee77ac`、`b1-f9d296e`。
- 运行夹具：假公司 `fixture-company-0001`、`lan.json/wall.json` 关闭、`workhours` 假数据、`company-id.txt` 假值；服务用随机本机端口，Paperclip 用模拟 HTTP（只读，记录请求）；`block-network` preload 阻断一切非白名单端口 fetch（天气 API 被阻断）；浏览器侧外部请求 abort。
- 未连接真实 3100/3200、未做任何审批/派发/验收/库存/支付写操作；模拟服务写请求 = **0**。

## 3. 独立验收状态

| 对象 | 状态 | 依据 |
|---|---|---|
| 源码与范围完整性（RC1） | **PASS（带 1 个既有测试回归）** | RC1 相对 B0 改动集中在仓库内声明文件；新增 `/visual-flags` 只读桥；无新写请求/轮询/模型调用 |
| 功能开关（feature flags） | **PASS** | 6 组配置（缺失/损坏/false/仅 office/仅 campus/两者 true）在真实服务+浏览器矩阵全部按 fail-closed 生效 |
| 集成替换/无重复/生命周期 | **PASS** | 浏览器 smoke 17 项检查全过；独立 adapter 测试 5/5 |
| 穿梭机世界坐标/轨道/lift/状态 | **PASS** | A-FIX1 18/18 + RC1 28/28 + 独立 adapter 测试；浏览器验证视锥内穿梭机 z 从 3.83 运动到 −6.85；`campusMotion=0` 静止 |
| 2D/3D 快照一致性 | **NOT_APPLICABLE（本分支）** | RC1 分支未含 `dr-demo-snapshot.js / dr-console-demo.js / dr-control-room-screen.js`（S2-16 共享快照模块在更早基线里才存在）；B/B1 又被阻断 |
| 办公室样板（Trae）组件 | **PASS** | 11/11；浏览器预览 logo 正常加载与阻断降级（占位槽）均验证 |
| Claude A-FIX1 组件 | **PASS** | 18/18；语义/法线/qualityProxy/替换清单覆盖 |
| Claude B/B1 组件 | **PASS（测试）/ BLOCKED（集成）** | 26/26；但 RC1 门禁明确阻断（入口对不上 serviceAxis、缺 baseY 契约等 P1），未进集成 |
| **集成场景（RC1）** | **REVIEW_REQUIRED（未授予全场景 PASS）** | 功能/结构 smoke 通过，但存在 1 个既有测试回归 + 无参考包视觉比对 + B/B1 未含 |

## 4. 全量测试：新 vs 既有失败

命令：`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/*.test.mjs`

| 运行 | tests | pass | fail | cancelled | skipped | 时长 |
|---|---|---|---|---|---|---|
| RC1 | 1041 | 983 | **41** | 16 | 1 | 60.3 s |
| B0（9e8c4f9） | 1023 | 966 | **40** | 16 | 1 | 62.6 s |

- **新增失败 1 条**：`tests/dr-campus-motion.test.mjs:139` `registry scene callback runs even without visible campus batch and restores previous callback`（B0 通过，RC1 失败：期望 `count===1`，实际 `0`）。
  - 根因：RC1 的 `dr-campus-registry.js` 给 `onFrame` 增加了「root 不可见或文档隐藏时跳过并 `resetFrame`」的逻辑（`01-ownership.md` 也写了「stops frame updates while hidden or inactive」）。这改变了「即使没有可见 campus batch，scene.onBeforeRender 仍回调一次」的既有契约，但**既有测试未同步更新**。
  - 严重度：**P1（阻断全绿）**；复现：在干净 worktree 跑上述全量命令。归属：集成方（Terra / `dr-campus-registry.js` 改动者）。建议：若暂停行为是有意的，需更新该既有测试并写明理由；否则恢复回调语义。
- 其余 40 fail + 16 cancelled 与 B0 集合一致（缺失本机 Windows 备份/运行数据、租户路径、command-view 取消等），未逐条在此重复，见 `evidence/full-suite-rc1.log`、`full-suite-b0.log`。

## 5. 功能开关矩阵（真实服务 + 浏览器）

| 配置 | `/visual-flags` 返回 | `/` 页面 campus | `/` officeV2 | `/?campus=1` campus | `/?layout=2` officeV2 |
|---|---|---|---|---|---|
| 缺失 | `{false,false}` | 无 | 无 | 无 | — |
| 损坏 JSON | `{false,false}` | 无 | 无 | 无 | — |
| 两者 false | `{false,false}` | 无 | 无 | 无 | — |
| 仅 office true | `{true,false}` | 无 | 无（默认 layout 非 2） | 无 | **有** |
| 仅 campus true | `{false,true}` | 无 | 无 | **有**（shell/vis2Rack/racks/motion/shuttle） | — |
| 两者 true | `{true,true}` | 无 | 无（默认 layout 非 2） | **有** | **有** |

结论：**fail-closed 成立**；`officeV2` 仅在 `?layout=2`（`startOfficeV2` 的布局版本门槛）且 office flag true 时真正启用，属既有布局契约，不是缺陷。

## 6. 集成 smoke（both flags true，`?campus=1`）

浏览器（Chromium 1280×720 DPR1）实测：

- 场景模块 `['shell','vis2Rack','racks','motion','shuttle']`，skipped=[]；旧 `campus-racks-static` / `campus-shuttle-static` / `campus-shuttle-vehicle` **均不存在**；`campus-rack-labels` 保留；`vis2-shuttle`/`vis2-rack-film` 存在；合并批颜色：旧蓝立柱=0，新蓝立柱=6048，橙=4656。
- 缠绕膜 opacity 0.28 且 `dynamic=true`；默认 cutaway 屋顶 2 块；`campusMotion=0` 时穿梭机 z 静止；默认（视锥内）穿梭机 z 3.83→−6.85 运动。
- 网络：6 秒窗口内 `/state` 轮询 2 次、`/visual-flags` 1 次、**0 写请求**；mock 写请求 0。
- 生命周期：10 轮进入/退出（campus/office 交替加载）canvas 恒 2、campus-root 每轮 ≤1（无重复根），几何/纹理计数无单调增长。
- 低画质：`?q=low` 正确以 low 档构建（rows 2 行、motion low）。
- 4 席中控 / DR 接待 / 品牌展示：RC1 **不含 B/B1**，场景无 `vis2b-*/dispatch-suite/office-vis2` 对象 → **NOT_INCLUDED**。
- 截图：`evidence/screenshots/rc1-{overview-high,eye-shuttle,rack-close,wheel-close,overview-low}.png`；蓝/橙像素统计见 `evidence/pixel-colors.json`（货架/穿梭机视角蓝色约 6.5–8.7%，橙 0.7–3.4%）。**视觉符合概念图/参考包未做比对**，故视觉结论为 REVIEW_REQUIRED。

## 7. 组件聚焦测试（隔离环境）

| 对象 | 命令输出 |
|---|---|
| RC1 门禁三件套（rack+racks+shuttle） | 28 / 28 通过 |
| A-FIX1 组件 | 18 / 18 通过 |
| B/B1 组件 | 26 / 26 通过（但被门禁阻断集成） |
| Trae 办公室样板 | 11 / 11 通过 |
| 独立 adapter QA（本次新增 `tests/vis2-r3-adapter.test.mjs`） | 5 / 5 通过 |

办公室样板浏览器预览：logo 正常 → `office-vis2-approved-logo-marks`；阻断 `assets/logo.png` → `office-vis2-brand-placeholder-slots` 且样板仍开启，无 JS 异常（仅预期的资源 ERR_FAILED）。证据：`evidence/office-preview/`。

## 8. 写入/模型调用/轮询审计

- RC1 diff 静态扫描：新增网络代码仅 `server.mjs` 的 `GET /visual-flags`（只读、无副作用）；无新增 `fetch`（业务侧）、`setInterval`、`WebSocket`、`child_process`、模型/补全端点。
- 浏览器观测：0 写请求，无模型接口，无新增轮询（/state 轮询沿用既有 3s）。
- 未修改任何产品源码、未合并、未 push main、未重启生产服务。

## 9. 结论与边界

- **源码/范围、feature flags、集成替换/生命周期、组件测试：PASS。**
- **RC1 集成场景：REVIEW_REQUIRED**，原因是 ① 全量套件新增 1 个既有测试回归（`dr-campus-motion`），全绿不成立；② 无 office/campus 参考包，视觉只能做结构/颜色证据，不能做目标图符合判定；③ B/B1（四席中控、接待、品牌）被门禁排除，集成范围不全。
- **未执行项及原因**：2D/3D 快照一致性（RC1 缺共享快照模块）；4K/60fps 与目标 GPU（本机 Chromium 仅结构性采样）；Windows/其它浏览器；真实 Paperclip 接入。
- **独立 QA 状态（按对象）**：RC1 集成候选 = REVIEW_REQUIRED；Trae 办公室样板组件 = PASS（集成 NOT_RUN）；Claude A-FIX1 组件 = PASS；Claude B/B1 = 组件 PASS / 集成 BLOCKED。

## 10. 证据索引（本分支 `qa/vis2-q-r3`）

- `docs/dispatch/vis2/qa-r3-rc1/report.md`（本报告）
- `docs/dispatch/vis2/qa-r3-rc1/evidence/run.json`（flags 矩阵 + smoke + 生命周期 + 网络）
- `docs/dispatch/vis2/qa-r3-rc1/evidence/{full-suite-rc1,full-suite-b0}.log`、`failure-comparison`（见下文）
- `docs/dispatch/vis2/qa-r3-rc1/evidence/focused-*.log`（RC1 28 / A-FIX1 18 / B1 26 / office 11 / adapter 5）
- `docs/dispatch/vis2/qa-r3-rc1/evidence/office-preview/`（logo 正常/降级 + 截图）
- `docs/dispatch/vis2/qa-r3-rc1/evidence/screenshots/`、`pixel-colors.json`
- 新增 QA 测试/夹具：`office3d/tests/vis2-r3-adapter.test.mjs`、`scripts/vis2-r3/{run.mjs,block-network.mjs}`

（如需按对象给出最终 PASS/FAIL/NOT_RUN/REVIEW_REQUIRED 汇总，即第 3 节表格。）
