---
id: V3-A2P-R1
base: feat/v3-align-sample @ 6f95f9e38226c1dfeb0c1552f07d65f076cef1f8
branch: feat/v3-align-sample
scope:
  - office3d/office-bar-geometry.js
  - office3d/office-island.js
  - office3d/office-vis2/
  - office3d/office-vis2-preview.html
  - office3d/tests/office-v3-align-sample.test.mjs
  - office3d/tests/office-vis2.test.mjs
  - office3d/docs/v3-a2p-*
  - dispatch/codex/outbox/V3-A2P-R1-report.md
budget: 4h
---
# V3-A2P-R1：格局对齐第 2 步再提前一截——座位 / 碰撞 / 沙发接线修正 + 陈设成组 + 叶色

V3-A2P（`6f95f9e`）已通过 Q-V1 复审（报告要点见下）。第 2 步要等 Trae 的 V3-A1-R1（新布局数据返工）通过后才能发卡。本卡先把复审时实测出的 3 处接线问题和 2 个观察项做掉，第 2 步汇合时只剩"接到 `LAYOUT_V3_ALIGN`"。

在 `feat/v3-align-sample` 上从 `6f95f9e` 继续**追加提交**；不 force push、不推 `main`、不合并 `feat/v3-align`。

## 硬约束（同 V3-A2P）

对**当前 `LAYOUT_V3`**，以下输出必须与 `345cd39` **逐字节相同**：

- 样板吧台、B0 原岛台（`office-island.js`）、品牌牌在高 / 低档下的全部几何数组、实例矩阵、世界矩阵与材质参数；
- 碰撞盒，以及 `office-bar-geometry.js` 全部导出函数（`barSpec`、`barGaps`、`barArcs`、`barSeats`、`barColliders`、`barLounges`、`validateBarGeometry`）的输出。

现有的 `docs/v3-a2p-baseline-geometry.json` 与对应测试保留；**新增**对 B0 原岛台与上述纯函数的基线比对。判断规则：只有当服务台半径（`island.barOuter`）与碰撞半径（`bar.radius`）**不同**时，才走新逻辑。

## A 共享座位函数（复审 S2-1）

现状：`barSeats()` 按 `bar.radius + 0.9` 生成座位，`display-staff-logic.js` 用它生成展示人员吧台座位与避让盒。在夹具（碰撞 6）下，座位半径为 **6.90 m**，落在岛外环形通道上。

要做：两半径不同时，`barSeats()` 优先返回布局 `bar.seats`（保留其 ID 与 yaw；缺少 `angle` 时由坐标推算）；没有 `bar.seats` 时，按 `island.stoolRadius` 生成，高 / 低档数量规则与现在一致。两半径相同时，输出逐字节不变。**不改 `display-staff-logic.js`**，它通过共享函数自然得到正确座位。

验收：夹具下 `barSeats()` 半径为 4.2 ± 0.07（`bar.seats` 取整），`display-staff-logic` 生成的吧台座位和避让盒全部在 r < 6 以内；V3 下逐字节不变。

## B 样板开 / 关碰撞统一（复审 S2-2）

现状：`office-island.js`（样板关闭时的 V3 原岛台）的碰撞盒按 `island.barOuter`（3.5）生成；样板开启时按 `bar.radius`（6）。

要做：`office-island.js` 的碰撞盒与返回的 `colliders` 改为 `barColliders(layout)`，即读 `bar.radius`；台身、台面、灯带仍按 `island.barOuter`。

验收：夹具下 B0 原岛台的 `colliders` 与样板 `barColliders(layout)` **完全相同**（外沿 6）；V3 下逐字节不变（V3 两个半径都是 3.5）。

## C 沙发半径与越界检查（复审 S2-3）

现状：夹具按方案值把沙发中心放在 5.8 m，实测沙发外沿 **6.15 m**，超出碰撞外沿 0.15 m；共享的 `barLounges()` 写死 5.25 m（导航坐沙发用它），两半径不同时与样板画面不一致。

要做：

1. 两半径不同时，`barLounges()` 读 `island.sofaOuter` 作为沙发中心半径；就座接近点为该半径减 0.55，与现行 5.25 / 4.7 的关系相同。样板 `bar.js` 改为使用 `barLounges()` 的结果，不再自行计算。
2. 新增纯函数 `validateIslandRings(layout)`，返回 `{ ok, errors, sofaOuterEdge }`，至少检查以下几项：
   - 沙发外沿（中心半径 + 实测靠背深度）不超过碰撞外沿；
   - 吧凳到服务台的间距 ≥ 0.45 m；
   - 吧凳与沙发两圈不相交；
   - 东西开口宽度 ≥ 1.5 m。

   只返回结果，**不抛错、不改数据**；沙发半径的最终数值由 Trae 在第 3 步路线验收中确定。
3. 预览夹具保留方案值 5.8，用于展示检查能报出 `SOFA_BEYOND_COLLISION`。另加一个合规样例（例如 5.45），检查结果为 `ok`；预览页可切换这两个样例。

验收：测试覆盖越界 / 合规两个样例；两半径相同时 `barLounges()` 逐字节不变。

## D 开放区陈设改为成组摆放（复审观察项）

现状：逐格先占的算法把 2 张长桌和 3 个矮柜都推到北侧边沿，绿植散落在工位之间（复审截图 `align-high-open.png`）。参考图（仓库 `main` 分支 `docs/visuals/target-office.png`）开放办公区是"桌岛 + 矮柜围合 + 绿植收边"。

要做：

1. 把 `planOpenFurnishing` 改为**模板化成组**，至少提供 2 种模板：
   - 共享长桌岛：长桌 ×1–2，配矮隔断，两端矮柜；
   - 绿植收边：绿植岛放在通道端头或区域转角。
2. 模板整体参与避让：不压通道，离工位 ≥ 0.6 m，组与组之间 ≥ 1.2 m。空间不足时整组跳过，并在 `skipped` 中列出。
3. 输出接口不变：`placements`、`colliders`、`corridors`、`skipped`、`summary`、`dispose`。新增 `groups` 清单（组 ID、模板、成员 ID、组外框）。
4. 预览用同一 `west-open` 夹具，摆出读得出"成组"的版本，并与 `6f95f9e` 同机位前后对照截图。

验收：保留现有全部断言（按实际顶点测量占地、不重叠、≥ 1.2 m、离工位 ≥ 0.6 m、隔断 ≤ 1.2 m、三角形 ≤ 8,000、新增绘制调用 ≤ 2、低档少于高档）。新增断言：每件陈设都属于某个组；长桌所在的组同时含矮柜或隔断；按组外框计，组与组之间 ≥ 1.2 m。

## E 开放区绿植叶色（复审观察项）

现状：`open-furnishing.js` 的叶片是单面三角形加 `computeVertexNormals`，俯视下接近黑色；吧台旁的绿植正常。

要做：优先复用 `office-vis2/plants.js` 的叶片做法（与 OF-R1 修复后的叶色一致）；如果不能复用，则保证叶片法线朝上或朝外、两面都有正确光照，并且不新增绘制调用。

验收：

- 测试断言：叶片三角形的面法线 y 分量全部 > 0，或采用的方案与 `plants.js` 相同；
- 预览截图中叶片区域的平均颜色 G > R 且 G > B，平均亮度不低于吧台绿植叶片的 70%，用同一光照、同一取色方法测量；报告附取色框与数值。

## 不做

- 不改 `office-layout.js`、`LAYOUT_V3` 数据、`app.js`、`display-staff-logic.js`、导航与导演、工位与业务映射；
- 不接入主场景（`officeSample=1` 下现有画面必须不变）；
- 不合并 `feat/v3-align`；
- 不推 `main`、不 force push、不部署、不启停服务；
- 报告不含密钥、IP、本机路径或账号。

## 交付

- 推送 `feat/v3-align-sample` 后把完整 SHA 告诉派发人。
- 报告 `dispatch/codex/outbox/V3-A2P-R1-report.md` 写明：
  - 做到 / 没做到 / 未验证；
  - A–E 逐项结果与数值；
  - 逐字节一致性的证明方法与结果；
  - D 的前后对照截图，E 的取色数值。

  取证不读真实运营数据：只读静态服务，外部请求与非 GET 拦截。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs`。失败按名称与 `6f95f9e` 比较，不得新增；全量测试只在空闲内存充足时运行。
- 完成后停下，等待 Q-V1 复审。
