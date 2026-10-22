# S2-2b：仓库墙面上的货门 / 人行门面板闪烁（z-fighting）修复（小任务，约 30–45 分钟）

**执行者：Codex（新会话；S2-2 的原作者最合适）。小镇线 · 场景。改 `warehouse-shell.js`（必要时 `app.js` ≤ 3 行）。** 先读：`_common.md`、`_lane-town.md`、`warehouse-shell.js`、`tests\warehouse-shell.test.mjs`。**证据（董事会侧）：** 视频 `E:\VirtualAIOffice\knowledge\项目\参考\f9061316ad733f34817b0204f8d8edfb.mp4`（6.8 秒，1280×720，从 DR 广场机位看仓库蓝色南墙）。逐帧抽取（每秒 6 帧）可见**墙面上的浅色门面板在帧与帧之间忽隐忽现**（有的帧 2 块，有的帧 1 块，位置抖动）。用户描述：「加载墙壁上的内容还是会闪」。

## 根因（董事会侧推断，须你实测确认）
- 货门面板是 `sz: .06` 的薄盒，中心 `z = WAREHOUSE.z1 + .011`，**前表面只比墙外表面高约 0.04 m**；人行门同理（`x = WAREHOUSE.x1 + .011`，`sx: .06`）。
- 相机 `near = 0.1、far = 6000`（`app.js` 第 96 行），24 位深度缓冲在距离 ~250 m 以上时精度已粗于 4 cm，**远景或广角时共面 / 近共面的面会互相抢深度**；`mergeStatic` 合并后绘制顺序变化也会让闪烁方式改变。
- **不要用全局抬高 `near` 来解决**（会影响整个办公室 / 前厅）。

## 要做的事
1. **复现**：浏览器（页面聚焦）进入广场机位与拉远机位（`REGION_FOCUS` 广场、再滚轮拉远），**录一段 ≥ 5 秒的帧序列（Playwright 逐帧截图即可）**，确认门面板闪烁；记录相机到仓库南墙的距离范围。**同时检查 `warehouse-sign`（门牌）、人行门、月台踏步 / 护栏、停车标线是否也有同类闪烁**，一并列出。
2. **修复（只在 `warehouse-shell.js` 内）**：
   - 所有「贴在墙上 / 地上」的薄件（卷帘门面板、门框片、人行门面板、门牌、停车标线、地面标识）**前表面抬出墙面 ≥ 0.12 m**（门牌 / 标线按各自合适的值，**写明数值与理由**）；
   - 这些薄件的材质加 `polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2`（地面标线用 `-1`）；
   - 门框用实体条而不是与墙共面的片；
   - **不得新增网格数超过 +4、不得新增光源、不得改 `quality.js / merge.js`**；修复后仍要能被画质档合并（不标 `userData.dynamic`）。
3. **回归检查**：同机位同画质**成对测量** calls（高 / 低）：相对 S2-2 现状增量 **≤ +2 calls**；`dr-warehouse-checks`、`T16` 压力、全量测试仍全绿；碰撞体与 `warehouseShellSpec()` 的外框常量不变（视觉件抬出的距离不得进入 `WEST_WALK / SERVICE_PASSAGE / DOCK` 的净空或行人路径；如抬出的门面板侵入月台 `z1 … z1 + 0.12`，说明处理方式）。
4. **补测试**：在 `tests\warehouse-shell.test.mjs` 增加**纯数据断言**——`warehouseShellSpec()`（或新增 `thinPartOffsets()`）列出所有薄件的「前表面相对墙面的偏移」，断言 **每一项 ≥ 0.12 m**（地面标线按其地面偏移单独断言），防止以后又被改回共面。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node docs/dr-warehouse-checks.mjs` 仍 `PASS`；`node --input-type=module --check < warehouse-shell.js`。
- **浏览器实测（页面聚焦）**：修复前后**同一机位、同一帧序列 ≥ 5 秒**的对比（贴帧间差异数值：对门面板区域做像素差统计，修复后应接近 0）；近景、广场机位、拉远机位各一张截图；**低档 `?q=low` 同样不闪**；控制台 0 错误。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；说明**成对 calls** 与偏移数值；如发现其它闪烁源（例如 `mergeStatic` 顺序、画质档切换瞬间），**只报告，不扩大范围**。**不要自己重启服务**（纯前端，Ctrl+F5 即可）。
