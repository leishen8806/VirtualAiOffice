# VIS2-Q-A 独立验收报告：Claude VIS2-W-A 货架/穿梭机组件

- **验收对象（候选）**：`origin/vis2w/rack-cell-a` @ `2879124f4f89f64721a0c328bd4d052c25bd6934`（完整 SHA，下文简称 C0）
- **声明基线**：`office3d/rev-20261023-2` @ `cbddb9fa3b874f7f56c8410928a8edd23013795c`（B0）
- **父提交核实**：`C0^ = cbddb9f...`，`git merge-base --is-ancestor B0 C0` 通过；C0 只比 B0 多 1 个提交（无夹带提交）
- **仓库**：`git@github.com:leishen8806/VirtualAiOffice.git`
- **验收方式**：独立 worktree（候选 `2879124` / 基线 `cbddb9f`），只读产品代码；未合并、未改产品代码、未 push main、未重启任何生产服务
- **验收时间**：2026-10-23（本机 macOS arm64，Node v22.22.1，Chromium 156）
- **报告分支**：`qa/vis2-q-a-2879124`（基于 C0 添加本报告与证据，不改任何已跟踪产品文件）
- **证据目录**：`docs/dispatch/vis2/qa-2879124/evidence/`

## 0. 结论摘要

| 验收项 | 状态 | 一句话依据 |
|---|---|---|
| 源码与范围完整性 | **PASS** | 提交只新增 4 个声明文件（441 行），无任何越界修改；父提交与声明基线一致 |
| 聚焦功能测试 | **PASS** | 候选自测 10/10；独立几何/生命周期/注册表探针 28/28；额外集成契约探针全部通过（暴露的是集成风险，不是组件缺陷） |
| 隔离视觉预览 | **PASS（构件声明属性）** | 实际浏览器预览截图核对：蓝立柱/橙横梁、车轮压在轨面、托盘落在横梁上、穿梭机侧橙条与四轮可见；无控制台错误、无外部网络；**未做概念图/参考包比对，不构成整体视觉验收** |
| 运行时生命周期 | **PASS** | 组件无 RAF/定时器/DOM；同种子确定性；dispose 幂等；50 次构建/销毁无场景残留；注册表合并与预览画质切换 20 轮稳定 |
| 全场景集成 | **NOT_RUN** | 候选未接入真实仓配场景；按任务要求，集成场景必须由集成候选单独验收。本报告只给组件级结论 |

**组件级性能声明复核**：`6 draw calls / 25 144 triangles` 是**组件单独渲染**口径，已独立复现（高画质）；**不是生产场景增量**，预览夹具下实测 8 calls / 25 522 triangles。低画质实际 draw call 为 5（自报 summary 写 6），详见问题 V2W-A-01。

## 1. 源码与范围完整性 — PASS

**提交内容**（`git diff --name-status B0..C0`）：

| 文件 | 状态 | 行数 | SHA-256 |
|---|---|---|---|
| `office3d/dr-vis2-rack-cell.js` | 新增 | 184 | `5f9feef56315633f5188f078249fde45285d095431454330d90a1333414853b2` |
| `office3d/dr-vis2-rack-cell-preview.html` | 新增 | 60 | `5a6e1bced258fb6236712f8d2b172c87de07eb4d51c8a299fda64825467852cf` |
| `office3d/tests/dr-vis2-rack-cell.test.mjs` | 新增 | 141 | `d8fc663ed619177ca96a1a09bf29d8a5f1ee284364bcb49cc2f14daf9693400b` |
| `office3d/docs/dr-vis2-rack-cell.md` | 新增 | 56 | `4327a9269b203f72592d2311d42dcb18452cd20bbd4b9d428838839a4cf5cec9` |

- **归属**：4 个文件均属 VIS2-W-A「仓配私有构件 + 隔离预览 + 自测 + 替换清单」范围；没有改动 `app.js / ui.js / index.html / server.mjs / package* / CI`，没有改其它模块、布局、旧货架/穿梭机源码。
- **范围**：diff 统计为 `4 files changed, 441 insertions(+)`，无删除、无重命名。
- **声明与实现的元数据一致**：分支、父提交、文件清单与 `docs/dr-vis2-rack-cell.md` 一致；文档明确写「组件预览，尚未正式接入」「不是仓配验收通过」，未夸大为已集成。

## 2. 聚焦功能测试 — PASS

### 2.1 候选自测

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/dr-vis2-rack-cell.test.mjs
```

结果：`# tests 10 / pass 10 / fail 0`（131 ms）。原始日志 `evidence/focused-test.log`。

### 2.2 独立探针（不依赖候选测试）

用独立脚本（`evidence/probes/probe-node.mjs`）直接读模块与 Three，**28/28 通过**，关键实测：

| 检查 | 实测值 |
|---|---|
| 立柱颜色 / 横梁颜色 | 只有 `#2f6fa8`（蓝）与 `#e8832a`（橙）；立柱竖向 4.4 m、横梁横向短高 |
| 三角形（高/低） | 25 144 / 9 132（与自报一致，按几何索引独立求和） |
| 实例数（高） | frame 444 / pallet 436 / carton 1084 / film 77 / rail 23（与文档一致） |
| 实例数（低） | frame 100 / pallet 204 / carton 408 / film 0 / rail 23；斜撑 0 |
| 货位/空位 | loads 109 / empty 35（约 24.3% 空位） |
| 容器约束 | 全部货架/托盘/纸箱/膜在 `highRack` 区域内，y 不超 4.45 m |
| 托盘支撑 | 109 个托盘底面全部落在 0.26/1.56/2.86 m 三层横梁顶面；两端悬出 >0.475 m 梁心 |
| 纸箱净空/顶梁空置 | 无一件穿过上一层横梁；最高托盘层 2.965 m < 顶梁 4.1 m |
| 轨道 | 两条轨（x 中心 ±0.7 m）、17 根枕木、端部缓冲块 |
| 车轮触轨 | 穿梭机几何最低点 y = 0.1050 = 轨顶面；最低点成 4 轮，轮中心 x 正好 ±0.7 m（轮宽 0.07） |
| 托盘不重叠 | 同层同排 109 个托盘 AABB 两两重叠数 = 0（独立计算） |
| 确定性 | 种子 4207 两次构建实例矩阵哈希相同；种子 999 不同 |
| 非法输入 | `setShuttle` 对 NaN/Infinity 忽略，z/lift 夹在路径与 0…0.12 |
| dispose | 两次 dispose 不抛错；几何 6/6、材质 6/6 收到 dispose；holder 子节点归零 |
| 50 次构建/销毁 | 场景 children 恒为 1（仅 holder），无残留 |
| 注册表契约 | `register/buildAll/summary/dispose` 正常；膜保持 opacity 0.28、静态件被合并、穿梭机保持 dynamic |
| 替换清单 | 4 个 legacy 名字都能在旧模块源码中找到 |
| 安全边界 | 模块无 RAF / 定时器 / Math.random / Date.now / performance.now / fetch / innerHTML / WebGLRenderer / DOM；无外部纹理/模型/URL |

探针原始结果：`evidence/probe-node.json`。

## 3. 隔离视觉预览 — PASS（构件声明属性）

**方法**：静态服务候选 `office3d` 目录 → Chromium 1280×720 DPR1 打开 `dr-vis2-rack-cell-preview.html`，固定种子 4207，实际截图（非 DOM 存在性判断）。截图见 `evidence/screenshots/`。

**实际检查结论**：

- 蓝立柱 `#2F6FA8` 与橙横梁 `#E8832A` 在货架近景清晰可辨；像素统计中蓝/橙各约 1.4%（`canvas-rack.png`），货架+托盘近景橙 3.9% / 蓝 2.1%。
- 托盘由三根承梁搭在两道橙横梁上，货物离上一层横梁有明显净空；顶层横梁无货。
- 穿梭机侧视图可见：低矮深色车体、**橙色识别条**、**四个车轮压在两条轨道的轨面上**、顶部承托板 + 托盘货物；车轮没有悬空/穿轨。
- 全部构件在预览地面范围内，未见飞出/穿墙；未见黑罩、巨牌、外部贴图或占位大盒子。
- 控制台 0 错误；页面仅请求 8 个本地静态文件（预览页、three、布局、构件、racks/shuttle 逻辑、bar 几何），**无任何外部或业务请求**；README/标题均标「组件预览，尚未正式接入」。
- **限制**：没有参考包 `office-target/current`、`campus-target/current`，无法做“与概念目标一致”的美术符合判定；本 PASS 仅针对任务列出的构件形态/颜色/支撑/触轨/遮挡/containment，不代表整体视觉或生产场景通过。缠绕膜半透明在截图中不显眼（0.28 透明度），只能算可接受，不作为精细质量证明。

## 4. 运行时生命周期 — PASS

- **模块自身**：无 `requestAnimationFrame`、无 `setInterval/setTimeout`、无 `Date.now/performance.now/Math.random`、无 fetch、无 renderer/DOM；构建完全由传入 seed 决定（确定性）。运动只暴露 `setShuttle({z,lift})`，不自建时钟（与文档一致）。
- **销毁**：`dispose()` 幂等；只释放自己创建的 5 个实例几何/材质与穿梭机几何/材质，不触碰共享布局/其它模块资源；50 次 build+dispose 后场景无残留；注册表 `dispose()` 后根节点移除、合并批次释放。
- **预览侧**：画质切换 20 轮（每次 dispose + rebuild）后 `renderer.info.memory` 稳定在 geometries=7 / textures=3，组件子节点数恒为 6，无累积；组件在注册表内合并后仍保留 `vis2-shuttle` 与 0.28 透明膜。
- **注意**：预览页自身使用 `renderer.setAnimationLoop` 持续渲染（预览夹具行为，不是构件 API），组件本身不创建循环；未来接线时不要把这个预览循环当作构件能力。

## 5. 全场景集成 — NOT_RUN（含集成契约风险）

候选**未接入真实仓配场景**（文档第五节、第八节均声明），因此不进行任何全场景验收，也不把组件 6 draw calls 当作生产增量。对替换契约的独立检查发现以下必须由集成方处理的风险（建议归属 Trae，涉及旧模块改造的归 Codex）：

1. **旧货架无法“只跳过货架/货物”**：`dr-campus-racks.js` 的 `buildCampusRacks()` 把货架立柱/横梁/货物、工位、月台门、穿梭机底座全部塞进同一个 `campus-racks-static` InstancedMesh（`inside()`），源码没有 skip 参数（`buildCampusRacks` 第 44 行；`inside` 第 31 行）。若集成时直接保留旧模块 → 新旧货架重复；若整体停用旧模块 → 工位/月台门/底座丢失。独立注册表实验（同时注册旧 racks 与候选）合并批中同时检测到旧蓝立柱 1152 个顶点与新蓝立柱 672 个顶点，**证明重复**；证据 `evidence/probe-integration.json`。
2. **标签归属耦合**：`campus-rack-labels` 在旧 `buildCampusRacks()` 内部创建（第 55 行）。契约要求“保留标签”，但若按“停用旧 racks”实现会连同标签一起消失；需要旧模块拆分或显式保留标签。
3. **新旧高度口径不同**：旧穿梭机 `railTop=.5 m`、旧立柱 `3.6 m`；新构件轨顶 `0.105 m`、立柱 `4.4 m`。替换轨道/车体后，月台、标签、外壳、人物高度关系必须重新同机位核对；当前没有任何集成截图，存在穿梭机相对月台“下沉/悬空”的视觉风险。
4. **画质与合并**：注册表会把候选不透明实例并入 `campus-opaque-batch-*`，候选的 6 calls 只在“组件单独渲染”成立；全场景真实 calls 增量必须由集成候选成对测量（env.js RenderPass / GTAO 口径），不能引用本报告数字。
5. **替换清单本身是对的**：`VIS2_REPLACES` 列出了 `campus-racks-static / campus-shuttle / campus-shuttle-static / campus-rack-labels` 四个真实存在的旧对象，粒度说明也基本准确；问题在于旧模块没有可直接调用的“部分停用”接口，需要集成方改旧模块（这超出 VIS2-W-A 的范围，也解释为什么本任务要求 full-scene NOT_RUN）。

## 6. 性能口径复核（不要误读）

| 口径 | 实测 | 来源 |
|---|---|---|
| 组件高画质，单独渲染，无阴影/无地面 | **6 calls / 25 144 tris** | 独立 `WebGLRenderer` 渲染，`evidence/visual.json` component.highCalls/highTris |
| 组件低画质，单独渲染 | **5 calls / 9 132 tris**（自报 summary `drawCalls=6`，因 film 批次 count=0 仍占一个 mesh） | `evidence/visual.json` component.lowCalls/lowTris；模块第 175 行 summary 逻辑 |
| 预览页（含预览地面 + 阴影 + 灯光夹具） | **8 calls / 25 522 tris** | `evidence/visual.json` previewInfo |
| 生产场景增量 | **NOT_RUN / 不可引用** | 未集成；文档也只说“组件自报” |

因此：**“六个 draw call / 25,144 三角形”只能作为组件级口径引用，不能当作生产场景性能，也不能据此推出接入后的增量。**

## 7. 基线/候选全量测试失败对照（独立复核“20 个既有失败”声明）

独立运行同一条命令（同一机器、同一 Node；A 组两次运行无并发负载）：

```
cd <worktree>/office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/*.test.mjs
```

| 运行 | tests | pass | fail | cancelled | skipped | 耗时 |
|---|---|---|---|---|---|---|
| 候选 C0（A 组） | 1180 | 1118 | **41** | **16** | 1 | 60.4 s |
| 基线 B0（A 组） | 1166 | 1108 | **41** | **16** | 1 | 60.5 s |
| 基线 B0（重复对照） | 1166 | 1108 | 41 | 16 | 1 | 60.0 s |
| 候选 C0（B 组，异常一次） | 1170 | 1111 | 41 | **17** | 1 | **668.4 s** |

- **A 组（候选 vs 基线，均 60 s）**：`not ok` 名称集合**逐项完全一致**（57 条 = 41 fail + 16 cancelled；`新增失败 = []`，`消失失败 = []`）。候选新增的 10 个测试用例全部通过。原始日志 `evidence/candidate-full-suite.log`、`evidence/baseline-full-suite.log`，汇总 `evidence/failure-comparison.json`。
- **B 组（候选重跑）出现一次不稳定**：`tests/pedestrian-v2.test.mjs` 文件级耗时 **636.1 s** 并导致 1 个额外 cancelled、总数/通过数变化（668 s 才退出）。**该文件单独运行**在候选与基线上都约 **26.4 s 且 7/7 通过**；它是既有重型寻路压力测试，候选分支的 4 个新增文件不参与该测试。基线同命令重复一次仍为 60 s 正常。因此我们把它记为**套件级偶发不稳定（环境/并发相关，未归属候选代码）**，并保留原始日志，不把 B 组数字作为候选回归证据，也不隐藏它。
- **“基线本来就有 20 个失败”不可复现**：本环境 A 组实际是 **41 fail + 16 cancelled = 57 条 not-ok**（候选/基线完全相同）。失败原因按文件/类别：
  - 租户路径缺失 `path resolves outside tenant root`：auth-routes 11、auth-accounts 3、tenancy-paths 2、tenancy-server 2（共 18 条，其中 16 条为该原因，另 2 条并发相关）；
  - `command-view-live.test.mjs` 16 条被取消（`Promise resolution is still pending...`，事件循环已结束）；
  - 缺失本机 Windows 备份/运行数据（`ENOENT ... office3d-backup-*`、地图数据等）：state-last-good、foyer-visit、pedestrian-stress、office-layout-v2、town-map、warehouse-env 等各 1；
  - 其余既有断言/环境差异：evidence-version 2、memory 2、town-nav 2、command-view-routes/display-staff/dr-campus-shell/dr-control-room 等各 1。
  - 结论：**“候选新增 0 失败”成立**（A 组集合一致）；但“20 个”这个具体数字来自 Claude 的环境（可能保留部分 Windows 运行数据），本环境无法复现，文档应改为环境相关描述，不要写死 20。
- 注：最早一次（与浏览器渲染并发）基线曾出现 4 个 pedestrian/office-display 文件级超时；无并发负载重跑后差异消失，证明是负载/并发导致的偶发超时，不是候选回归。

## 8. 问题清单

> SHA 均为候选完整 SHA `2879124f4f89f64721a0c328bd4d052c25bd6934`；严重度：P2 中、P3 低。

| ID | 严重度 | 位置 | 现象 / 预期 | 复现 | 证据 | 建议归属 |
|---|---|---|---|---|---|---|
| V2W-A-01 | P3 | `office3d/dr-vis2-rack-cell.js:175`；`office3d/docs/dr-vis2-rack-cell.md:25` | 低画质 summary 自报 `drawCalls: 6`，实际渲染只有 **5** 次（film 批次 count=0 仍被计入“批次”）；文档低画质表格写 6。预期：自报与实际一致，或明确写“分配批次/实际调用”差异 | 组件级低画质 `renderer.render` 后读 `renderer.info.render.calls`（脚本 `evidence/probes/run-preview.mjs` 的 component 部分） | `evidence/visual.json`（`lowCalls:5`、`preview-low-summary`） | Claude（文档/自报口径） |
| V2W-A-02 | P2（集成风险，非组件缺陷） | `office3d/dr-campus-racks.js:31/44`、候选 `VIS2_REPLACES` | 旧 `campus-racks-static` 无“跳过货架/货物”参数且混装工位/月台门/穿梭机底座；若集成时不改旧模块，新旧货架重复（独立注册表实验：合并批同时检测到旧蓝立柱 1152 顶点 + 新蓝立柱 672 顶点）。预期：全场景只出现一套货架且工位/门/底座保留 | 运行 `evidence/probes/probe-overlap-integration.mjs` | `evidence/probe-integration.json`（`integration-both-present-without-replacement`） | Trae（集成）+ Codex（旧模块拆分） |
| V2W-A-03 | P2（集成风险） | `office3d/dr-campus-racks.js:55` | `campus-rack-labels` 由旧 `buildCampusRacks()` 内部创建；契约要求保留标签，但“停用旧 racks”会连标签一起丢。预期：拆分旧模块，单独保留标签（或候选显式接管标签后另行验收） | 静态检查旧模块；见探针 `labels-inside-legacy-function` | `evidence/probe-integration.json` | Trae（集成契约）/ Codex（旧模块） |
| V2W-A-04 | P2（集成风险） | 旧 `dr-campus-shuttle.js:30 railTop=.5`、旧 racks 立柱 3.6 m；候选 `VIS2_DIMENSIONS` 轨顶 0.105 m、立柱 4.4 m | 替换轨道/车体/货架后，月台、标签、外壳、人物高度关系未验证；可能相对月台“下沉/悬空”。预期：集成候选同机位截图 + 高度回归 | 需集成候选；当前无 | 本报告第 5 节；`docs/dr-vis2-rack-cell.md` 第八节自述未接入 | Trae |
| V2W-A-05 | P3 | `office3d/docs/dr-vis2-rack-cell.md:31` | “基线本来就有 20 个因缺本机运行数据而失败的用例”在本环境不可复现：独立全量 41 fail +16 cancelled（候选/基线集合一致）。预期：改为环境相关计数，或注明取证环境 | 跑两份全量套件并比较 not-ok 集合 | `evidence/failure-comparison.json`、两份 full-suite 日志 | Claude（文档）/ Trae（验收记录） |
| V2W-A-06 | P3（提示） | 候选测试 | 自测只断言 `light.drawCalls <= 6`，未校验低画质实际 5；也仅在“源码字符串包含”层面验证替换清单，未验证注册表内旧模块与候选共存时的重复风险。建议补精确断言/集成共存探针 | 阅读 `tests/dr-vis2-rack-cell.test.mjs` 第 7 个用例 | `evidence/focused-test.log` + 测试源码 | Claude |
| V2W-A-07 | P3（观察，不算缺陷） | `dr-vis2-rack-cell-preview.html` | 预览用 `setAnimationLoop` 持续渲染（夹具行为，组件本身无 RAF）；若未来把预览当成运行时基线，需注意持续渲染/隐藏页行为 | 打开预览观察 | `evidence/visual.json` | Claude（仅说明） |
| V2W-A-08 | P3（观察） | 候选缠绕膜 | 0.28 透明膜在截图中几乎不可见，“约 72% 带膜”主要是统计/材质设置，不是清晰的视觉证据；近距离可见但不够显著。建议后续给近景或提高可读性 | 打开预览货架近景 | `evidence/screenshots/canvas-pallets.png` | Claude（视觉迭代，非阻断） |
| V2W-A-09 | P3（环境/套件稳定性，未归属候选） | `tests/pedestrian-v2.test.mjs`（既有重型压力测试） | 全量套件并发运行时，该文件偶发 636 s 文件级超时并多 1 个 cancelled；单独运行候选/基线均 26.4 s、7/7 通过。预期：全量命令稳定或明确标注该测试的耗时/并发限制 | 全量套件重复运行（见 B 组日志）；单独运行该文件对照 | `evidence/candidate-full-suite-quiet.log`、`evidence/baseline-full-suite-repeat.log`、`evidence/failure-comparison.json` | Trae（测试基础设施）；不归 Claude 组件 |

## 9. 验收边界（不可被本报告背书的内容）

1. **不授予全场景验收**：候选未接入，`full-scene integration = NOT_RUN`；不得凭组件测试或 6 draw calls 宣布仓配场景通过。
2. **不宣布生产性能**：6 calls / 25 144 triangles 是组件单独渲染口径；预览夹具下为 8 calls / 25 522 triangles；生产增量未测。
3. **不宣布美术符合概念图**：无 office-target/current、campus-target/current 参考包，无法做目标图对比；本报告只核对蓝/橙、车轮/轨道、托盘/横梁、containment 等声明属性。
4. **未覆盖**：Safari/Firefox/Windows、真实 GPU 4K/60fps、真实 Paperclip 接入、集成后的标签/月台/外壳/人物遮挡、长时间运行内存曲线。
5. 本报告未修改任何产品代码、未合并分支、未推 main、未重启生产服务。

## 10. 证据索引（均在报告分支 `qa/vis2-q-a-2879124` 下）

- `docs/dispatch/vis2/qa-2879124/evidence/probe-node.json` — 独立几何/指标/生命周期探针（27 项）
- `docs/dispatch/vis2/qa-2879124/evidence/probe-integration.json` — 托盘重叠 + 旧/新共存重复实验
- `docs/dispatch/vis2/qa-2879124/evidence/visual.json` — 预览、组件级/预览级性能、画质切换 20 轮
- `docs/dispatch/vis2/qa-2879124/evidence/pixel-colors.json` — 截图蓝/橙像素统计
- `docs/dispatch/vis2/qa-2879124/evidence/failure-comparison.json` — 候选/基线失败集合逐项比较
- `docs/dispatch/vis2/qa-2879124/evidence/focused-test.log` — 候选自测 10/10
- `docs/dispatch/vis2/qa-2879124/evidence/candidate-full-suite.log` / `baseline-full-suite.log`（A 组）
- `docs/dispatch/vis2/qa-2879124/evidence/candidate-full-suite-quiet.log`（B 组异常）/ `baseline-full-suite-repeat.log`（基线重复对照）
- `docs/dispatch/vis2/qa-2879124/evidence/candidate-file-sha256.txt` — 4 个候选文件哈希
- `docs/dispatch/vis2/qa-2879124/evidence/screenshots/*.png` — 11 张实际截图（总览/货架/穿梭机/通道/车轮/托盘/侧视/低画质）
- `docs/dispatch/vis2/qa-2879124/evidence/probes/*.mjs` — 独立探针脚本（可复跑）

**最终裁决（组件级）**：源码/范围、聚焦测试、隔离视觉（声明属性）、运行时生命周期 **PASS**；全场景集成 **NOT_RUN**。构件可进入集成候选阶段，但不能据此宣布仓配场景验收通过或生产性能达标。
