# S2-5-campus-racks：高位货架仓储区、货架编号与静态月台（经注册口加入，不改 app.js，约 1–1.5 小时）

**执行者：Codex（新会话）。小镇线 · 场景。** **不改 `app.js`**（通过 S2-4 的 `dr-campus-modules.js` 注册；可与 O 系列的 `app.js` 卡并行）。**前置：S2-4 已验收。** 先读：`_common.md`、`_lane-town.md`、`docs\dr-campus-plan.md`（`highRack / receiving / shipping / picking / packing` 区域坐标、动画预算表）、概念图（高位货架 A1 / R2 / C2 / B2、蓝色立柱橙色横梁、货箱、月台门）、`dr-campus-registry.js` 与 `dr-campus-modules.js`、`warehouse-shell.js`（实例化写法与薄件偏移）。

**允许修改：** 新增 `dr-campus-racks.js`、`dr-campus-racks-spec.mjs`（纯数据：货架排布、编号、月台位，Node 可测）、`tests\dr-campus-racks.test.mjs`；`dr-campus-modules.js`（**只追加一行登记**）；README 一节。**不要改** `app.js`、`office-layout.js`、`env.js`、`warehouse-shell.js`、`quality.js`、`merge.js`、`server.mjs`。备份 `dr-campus-modules.js` 到 `office3d-backup-s2-5`。

## 要做的事
1. **`dr-campus-racks-spec.mjs`**：从 `CAMPUS_ZONES` 的 `highRack`（并排除 `CAMPUS_SHUTTLE_STRIP` 与走道净空）生成货架排布：多排高位货架（建议 4 排 × 每排若干节，**每节为一个实例**），货架编号标牌 **A1 / R2 / C2 / B2**（Canvas 贴图，偏移 ≥ 0.12 m），货箱位（实例化，随机性来自**固定种子**，不得用 `Math.random`），**走道净宽 ≥ 2.5 m**（叉车通行，供 S2-6），**不压穿梭机展示带、不出 `highRack` 外框**。同时给出 `receiving`（4 个月台位 + 月台门）与 `shipping`（3 个）、`inspection / picking / packing` 的静态台架清单（只画体量，不含动画）。
2. **`dr-campus-racks.js`**：用 `InstancedMesh` 绘制货架立柱 / 横梁 / 货箱（**同几何同材质合并实例化**），月台门（卷帘门平面 + 门框，**前表面偏移 ≥ 0.12 m**，吸取 S2-2b 教训）；低档：货架降为 2 排、少量货箱，月台门简化。**全部静态，不标 `userData.dynamic`**；不新增光源。
3. **穿梭机展示带**：只在 `x=-148…-144, z=-8…6` 画一条**空的导轨底座与标识「穿梭机展示位（预留）」**，**不做动画**（动画由后续单独卡负责，且只做展示、不接数据）。
4. **预算：** 高档 ≤ **+3 calls、≤ 18k 三角形**；低档 ≤ **+1 call、≤ 5k**；不新增光源；园区开启（`?campus=1`）、同机位同画质成对测量。

## 测试与验收
- 纯数据：货架全部在 `highRack` 内、互不重叠、走道 ≥ 2.5 m、不压穿梭机展示带、编号标牌唯一、月台位数量 4 / 3、种子确定性（两次相同）；实例数上限；无 `Math.random / Date.now / fetch / innerHTML`。
- 浏览器：`?campus=1` 的园区俯视、货架近景、月台近景、低档各一张（深浅主题）；成对 calls；5 秒帧序列无闪烁；控制台 0 错误；默认页面零变化。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；贴实例数与三角形统计。**不要自己重启服务。**
