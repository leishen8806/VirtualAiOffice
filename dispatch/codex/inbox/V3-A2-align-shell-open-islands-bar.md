---
id: V3-A2
base: feat/v3-align @ f0f4632b0a4f77350fd87a66df5e10ef62f63d5b（另需合入 feat/v3-align-sample 的 V3-A2P-R1 通过版本）
branch: feat/v3-align-scene
scope:
  - office3d/office-v3-modules.js
  - office3d/office-layout-v3-scene.js
  - office3d/office-vis2/
  - office3d/office-furniture-v2.js
  - office3d/office-island.js
  - office3d/office-bar-geometry.js
  - office3d/display-departments.js
  - office3d/display-staff.js
  - office3d/display-staff-logic.js
  - office3d/app.js（仅限第 963 行把 LAYOUT_V3 换成 OFFICE_LAYOUT，不新增行，见第 0 项）
  - office3d/tests/office-v3-align-scene.test.mjs
  - office3d/tests/office-v3-align-sample.test.mjs
  - office3d/tests/office-vis2.test.mjs
  - office3d/docs/v3-align-scene.md
  - dispatch/codex/outbox/V3-A2-report.md
budget: 6h
---
# V3-A2：格局对齐第 2 步——新格局的外壳、开放区、吧台岛与碰撞

V3 格局对齐的第 1 步（Trae 的 V3-A1，`feat/v3-align` @ `f0f4632`）已通过 Q-V1 复审：`LAYOUT_V3_ALIGN` 的数据、门洞、区域类型与公共路径都已冻结，与董事会批准的方案甲（`83ecc1b`）逐项一致。本卡把这份数据画成真正的场景：**有墙的房间才建墙，开放区不建墙，中央是直径 12 m 的吧台岛加 4 m 宽环形通道**。之后第 3 步由 Trae 做 25 个工位、角色路线与回归，第 4 步由 Codex 做样板接线、机位与性能。

## 顺序与分支

1. **先完成并交付手上的 V3-A2P-R1**，等它通过 Q-V1 复审。派发人会告诉你通过的 SHA。
2. 从 `feat/v3-align` @ `f0f4632` 新建 `feat/v3-align-scene`，先 merge `feat/v3-align-sample` 的**通过版本**（不得合入未审提交），再开始本卡。
3. 如果 A2P-R1 还在复审，可以先做不依赖样板的部分（第 0、1、2 项），样板通过后再 merge。
4. 只追加提交；不 force push、不推 `main`、不改 `feat/v3-align` 与 `feat/v3-align-sample` 本身。

## 硬约束：现有 V3 完全不变

不带 `align=1` 的 `?layout=3`（样板关 / 开两种状态）下，场景必须与 `f0f4632` **逐字节相同**：

- 判断依据：全部网格的几何数组、实例矩阵、世界矩阵、材质参数与碰撞盒的哈希；
- 高档 overview 的绘制调用与三角形数；
- FIX3 `office-v3-meeting-navigation` 全部通过。

新逻辑只在 `layout.variant === 'align'` 时生效。

## 要做

### 0. 让 `?layout=3&align=1` 真正用上新数据

现状：`app.js` 第 963 行把 `LAYOUT_V3` 写死，传给 `selectEnvironmentConflicts` 与 `startOfficeV3`；`startOfficeV3` 又把 `LAYOUT_V3` 写死，传给注册表。因此 `align=1` 时场景仍按旧布局搭建。

- `office-v3-modules.js` 的 `startOfficeV3`：注册表的 `layout` 用 `shared.layout`（缺失时回退 `LAYOUT_V3`）。
- `app.js` **只允许改第 963 行**：把这一行里的两处 `LAYOUT_V3` 换成 `OFFICE_LAYOUT`，不新增行（O4 / O4b 有 `app.js` 行数预算）。稳定 V3 下 `OFFICE_LAYOUT === LAYOUT_V3`，行为不变。除此之外不改 `app.js`；其余接线留给第 4 步。

### 1. 外壳：只有有墙区域建墙

- `office-layout-v3-scene.js` 的 `roomSegments`，以及 `office-vis2/shell-finish.js` 的门框 / 隔断：在 ALIGN 下只处理 `region.walled === true` 的 7 间（board、plan、review、market、service、aftersales、marketing），门洞按数据开在 `doors[0]`。
- `walled === false` 的区域（kb、product、eng、west-open、drlife、creative、dining、leisure）**不建墙、不建门框**，只用地面色块或边线区分。需要视线分隔时，只用 ≤ 1.2 m 的矮隔断，并且不得放在走廊上。
- 外围幕墙、入口与前厅不变。

### 2. 地面与分区

- 中央环形通道 `ring 6..10`（4 m 宽）做成清晰可见的铺地。参考图中，这条通道是浅色环带配深色描边，不能只画一条细线。
- `office-vis2/zone-finish.js` 的分区地面按 ALIGN 区域与 `kind` 着色：开放区、展示区、会议室各自统一色调，保持 OF-R2 的暖色系。
- `corridors`、`passages` 中的走廊在地面上可辨认，且不得被陈设占用（见第 4 项）。

### 3. 吧台岛

- 合入 V3-A2P / A2P-R1 后，ALIGN 下的吧台按以下尺寸绘制：服务台 `island.barOuter = 3.5`、碰撞外沿 `bar.radius = 6`、吧凳环 `stoolRadius = 4.2`、沙发环 `sofaOuter`。
- 样板开、样板关两种状态下，吧台碰撞都是外沿 6、东西开口 ≥ 1.5 m。
- `validateIslandRings(layout)` 对 ALIGN 报出的问题（例如沙发外沿越界）**原样写进报告**，不在本卡改布局数据；沙发半径的最终值由第 3 步决定。

### 4. 开放区陈设

- 用 V3-A2P-R1 的成组陈设组件，给 west-open、kb、product、eng、drlife 摆陈设：
  - 输入：各区域外框、该区域的真实工位点（避让半径 1 m + 0.6 m），以及本区域内或贴边的全部走廊 / 通道（`corridors`、`passages`）。
  - 已知会穿过无墙区域的走廊：`westNorthCross` / `northMeetingBuffer`（west-open 北缘 `z −4.5..−3`）、`westSouthCross`（leisure `z 5.8..7.3`）、`eastMiddleCross`（creative `x 20.5..22.5`），这些都必须让出。
- creative、dining、leisure 三个展示区按参考图摆休闲或展示陈设，同样让出走廊。
- 有墙房间的门外 1.5 m × 1.5 m 范围内不放任何陈设。
- 全部陈设的碰撞盒**注册到现有碰撞系统**（`collision.add`），并汇总成一份障碍物清单，挂在注册表上，可通过 `registry.get('…').obstacles()` 之类的接口读取。第 3 步 Trae 会把它接入路线验收。

### 5. 展示部门与展示人员

- `display-departments`、`display-staff` 在 ALIGN 下读取的是四角有墙展示室的新门向（east / west / north）。现有逻辑按 `door.side === 'south'` 二分，且 `displayLayout()` 把 `westNorthCross` / `eastSouthCross` 当作 north / south 走道。
- 你可以选择：
  - 让它们在 ALIGN 下正确工作：牌匾朝向门；展示人员只在本房间内与门外 1.5 m 范围内活动，不进入走廊以外的开放区；
  - 或者在 ALIGN 下先以"待接"挂起（`pendingModule`），并在报告中列明，留给第 3 步。
- 无论选哪种，ALIGN 下都不得抛错，稳定 V3 不变。

## 测试（新增 `tests/office-v3-align-scene.test.mjs`，不启动浏览器）

- ALIGN 下墙段只来自 7 间有墙房间；每间恰有一个 1.5 m 门洞，位置与数据一致；无墙区域 0 墙段。
- 吧台：服务台外沿 3.5 ± 0.05，碰撞外沿 6，东西开口 ≥ 1.5 m；样板开、关两种状态的碰撞盒相同。
- 陈设：
  - 实测顶点占地与 `corridors`、`passages` 零重叠；
  - 离工位点 ≥ 1.6 m；
  - 不进入有墙房间门外 1.5 m 范围；
  - 不进入吧台岛碰撞圈与环形通道 `r < 10`；
  - 全部登记在碰撞系统与障碍物清单中。
- 稳定 V3 逐字节不变（按"硬约束"一节的口径做哈希比对）。
- `resolveOfficeLayout('?layout=3&align=1')` 搭建的场景中，注册表收到的布局 `variant === 'align'`。

## 视觉取证（浏览器）

- 只读静态服务，`/state` 用空状态夹具（无人物、无任务、`world: null`），外部请求与非 GET 一律拦截。
- 机位：`?layout=3&align=1` 与 `&officeSample=1` 两种状态，各拍总览、吧台岛、west-open、产品 / 工程区、四角展示室各一张，外加一张与参考图（`main` 分支 `docs/visuals/target-office.png`）同视角的对照图。
- 稳定 `?layout=3`（样板开 / 关）的总览与 `f0f4632` 做像素对照，差异应与同版本重拍的噪声同量级。
- 性能（高档 overview，样板开）：ALIGN 的绘制调用不超过稳定 V3 + 6，三角形不超过 +20%；低档三角形少于高档。

## 不做

- 不改 `office-layout.js`（`LAYOUT_V3_ALIGN` 数据由 Trae 持有；需要改数据时，停下并在报告中写明原因）；
- 不改 `office-v3-public-path.js`、导航与导演、25 个工位的业务映射、FIX3 路线断言（第 3 步）；
- `app.js` 除第 0 项那一行外不改；
- 不推 `main`、不 force push、不部署、不启停服务；
- 报告不含密钥、IP、本机路径或账号。

## 交付

- 推送 `feat/v3-align-scene` 后把完整 SHA 告诉派发人。
- 报告 `dispatch/codex/outbox/V3-A2-report.md` 写明：
  - 做到 / 没做到 / 未验证；
  - 第 0–5 项逐项结果；
  - 稳定 V3 逐字节一致的证明；
  - `validateIslandRings` 对 ALIGN 的输出；
  - 障碍物清单的接口与数量；
  - 截图与性能数值。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs`。失败按名称与 `f0f4632` 比较，不得新增；全量测试只在空闲内存充足时运行。
- 完成后停下，等待 Q-V1 复审。
