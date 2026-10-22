# A4-home-room-scene：个人空间 3D 房间模板与进入点（最小接线，默认不加载，约 1–1.5 小时）

> **【2026-10-21 夜：A4 已作废，请勿再派发。】** 改为独立页面方案，见 `A4p-home-page-room.md`（Trae，不改 app.js）。

**执行者：Codex（新会话）。小镇线 · 场景。改 `app.js`（同一时间只有一个任务改它）。** **前置：A7 已验收（`home-items-3d.js`）、A1 已验收（`town\home-space.mjs` / `home-catalog.mjs`）；S2-2 已验收（仓库建筑与 `warehouse-entrance`）。** 缺任一项先停下汇报。先读：`_common.md`、**`_lane-town.md`**、**`docs\home-space-spec.md`**、`town\home-space.mjs`（`cellCenter / CELL_M / GRID_W / GRID_D / DOOR`）、`home-items-3d.js`、`app.js` 里镜头目标（`setGoal` / `goal`）、`REGION_FOCUS`、`WALL_SPOTS` 的用法、`quality.js`（**只读**，了解静态合并与画质档）。

**允许修改：** `app.js`（**只留最小接线 ≤ 30 行，逐行列出**）、新增 `home-room.js`、`home-room-geometry.mjs`（**纯几何函数，可在 Node 测试**）、`tests\home-room-geometry.test.mjs`；`README.md` 追加一节「个人空间房间（A4）」。**不要改**：`server.mjs`、`ui.js`、`index.html`、`quality.js`、`merge.js`、`director.js`、`office-layout.js`、`env.js`、`town\`、所有业务模块。备份 `app.js` 到 `office3d-backup-a4`。**不需要重启服务；不得向 Paperclip 发请求。**

## 要做的事
1. **`home-room-geometry.mjs`（纯函数）**：`ROOM = { cellsW:16, cellsD:12, cellM:0.5, wallH:3.0, wallT:0.12 }`；`cellToLocal(cx, cz)`（房间局部坐标，**原点在房间中心、地面 y=0**；`cx` 向东、`cz` 向南）；`localToCell(x, z)`（取整，越界返回 `null`）；`doorOpening()`（南墙正中 `cx 7…8` 的门洞，宽 1.0 m、高 2.2 m）；`wallSegments()`（四面墙的矩形片段，**南墙在门洞处断开**）；`placementTransform(placement, itemDef)` → `{ x, z, rotY }`（占用矩形中心的局部坐标 + 绕 Y 旋转弧度，`rot` 0 / 90 / 180 / 270 → 0 / π/2 / π / 3π/2；**`rot=0` 模型正面朝南**）；`roomBounds()`。**不引用 THREE / DOM。**
2. **`home-room.js`**：`createHomeRoom(THREE, { scene, materials, itemBuilder })` → `{ group, mount(worldPos), unmount(), setPlacements(list, catalog), cellToWorld(cx, cz), focusGoal(), dispose() }`：
   - **房间模板**：地板（`16×12` 格，细网格纹理，**浅木色**）、四面墙（**南墙留门洞**，门洞外有 1 m 宽的小门廊地面）、踢脚线、**无屋顶**（保持俯视可见）、**不新增任何灯光**（沿用场景灯光；墙内侧用略亮的材质弥补）；入口净空区地面用淡色标记（`ENTRY_CLEAR`）。
   - **挂载位置**：`mount(worldPos)` 把房间放在世界某个固定位置；v1 取 **`x=70, z=-30`**（办公室、广场与环境铺装之外，避开 `ENVELOPE / CAMPUS_PAVING` 与已有树 / 路灯；**用代码检查与已有对象无重叠并把检查写进测试**）。**房间默认不创建任何对象**——**只有被调用 `mount` 才创建**；`unmount()` 彻底移除并 `dispose`，**关闭状态零成本**。
   - `setPlacements(list, catalog)`：用 `itemBuilder(THREE, itemId)` 构建模型并按 `placementTransform` 摆放（A7 的原点约定：占用矩形中心）；**同一 `itemId` 的多件共享材质；超过 8 件同类时用 `InstancedMesh` 或合并**；传入前**必须用 `town\home-space.mjs` 的 `validateLayout` 校验，非法项丢弃并 `console.warn` 一次**（不崩溃）。
   - `focusGoal()` → 镜头目标（`{ az, el, r, t }`，**俯视约 55°、能看到整个 8×6 m 房间与门**）。
3. **`app.js` 最小接线（≤ 30 行）**：创建房间对象**但不 mount**；挂 `window.__office.home = { room, enter(), leave(), setPlacements(...) }`（**调试与后续 A5/A6 使用**）；`enter()` = `room.mount()` + `setGoal(room.focusGoal())`（**平滑镜头，可被用户操作中断**）；`leave()` = 记录进入前镜头并还原 + `room.unmount()`。**URL 参数 `?home=1` 仅用于开发期自动 `enter()`**（A3 / A5a 接入正式开关后移除，在代码注释里写明）。**不得给 `/state` 或任何轮询加请求；不得改动既有镜头预设、小地图、搜索、区域按钮。**
4. **画质与性能**：房间**静态件不标 `dynamic`**（摆放的物品也不标，A5 编辑时才临时标）；**房间自身（不含物品）≤ 12 个网格**；`enter()` 前后**同机位同画质成对测量**：房间内（含 12 件起始物品全部摆放的极端情况）高档 ≤ **+30 calls**、低档 ≤ **+12 calls**（硬上限 +45 / +18），**不 enter 时增量为 0**。测量口径：页面聚焦、`?q=` 干净加载、页面渲染循环里读 `renderer.info`、等 6 秒以上。
5. **隔离**：`enter()` 期间 **`/state` 轮询、治理中心、任务面板照常工作**（实测打开治理中心）；`unmount()` 后**场景对象数与进入前一致**（泄漏检查：对比 `renderer.info.memory.geometries / textures` 前后）。

## 测试（`tests/home-room-geometry.test.mjs`）
- `cellToLocal / localToCell` 往返（全部 192 格）；越界返回 `null`；`wallSegments` 南墙在 `cx 7…8` 断开且其余墙封闭；`doorOpening` 尺寸；`placementTransform` 四个旋转 × 非对称物品（`bed_single`）的中心与 `rotY`，**占用矩形与 `occupiedCells` 的包围矩形一致**。
- **挂载位置检查**：`x=70, z=-30` 的房间包围盒与 `ENVELOPE / PLAZA / CAMPUS_PAVING / MINI_BOUNDS` 无重叠（`MINI_BOUNDS` 若覆盖则说明小地图会显示该区域并在汇报里写出处理）。
- 静态检查：`home-room-geometry.mjs` 不含 `THREE / document / fetch / Math.random / Date.now`；`home-room.js` 与 `app.js` 新增行不含 `innerHTML / eval / fetch(`（`app.js` 新增 ≤ 30 行）；无 `buy / price / balance / wallet`。
- 既有测试全过，**不得放宽**。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check < app.js`、`< home-room.js`、`< home-room-geometry.mjs`。
- **浏览器实测**（页面聚焦；`?home=1` 与 `window.__office.home.enter() / leave()`）：房间截图（空房间 + 摆满 12 件起始物品，**深 / 浅主题各一张**）；`enter → leave` 后**对象数与内存与进入前一致**；成对 calls 数据；打开治理中心验证不受影响；`?q=low` 同样可用；控制台 0 错误；**不 enter 时**办公室 / 广场 / 小地图**与改动前逐像素 / 逐数据无差异**（calls、对象数一致）。
- 汇报「做到 / 没做到 / 未验证」且与磁盘一致；**`app.js` 接线行逐行列出**。**不要自己重启服务。**
