# A4p-home-page-room：个人空间独立页面——3D 房间与物品展示（取代 A4，不改 app.js，约 1.5 小时）

**执行者：Trae（新会话）。小镇线。** **本卡取代 `A4-home-room-scene.md`（A4 作废）。** 设计变更理由（董事会侧）：A4 要把房间挂进主场景并改 `app.js`，而 `app.js` 是全项目瓶颈（办公区与园区施工整条链都在占用它）；个人空间**独立成一张静态页面 `home.html`**，自带一个小 Three.js 场景，**与主场景零耦合**：不改 `app.js` / `ui.js`、不增加主场景 calls、故障天然隔离。**前置：A1（`town\home-space.mjs / home-catalog.mjs`）、A7（`home-items-3d.js`）已验收；A2 已验收；A3 已验收（本卡暂不用 API）。** 先读：`_common.md`、`_lane-main.md`、`_lane-town.md`、**`docs\home-space-spec.md`（唯一规格）**、`home-items-3d.js` 与 `home-items-gallery.html`（**直接参考其页面结构、three 的引用方式、主题与相机控制写法**）、`town.html` 的最简页面结构、`vendor\` 的 Three 版本。

**允许新增：** `home.html`、`home-page.js`（页面入口）、`home-room.js`（房间模板与摆放渲染）、`home-room-geometry.mjs`（**纯几何**，Node 可测）、`tests\home-room-geometry.test.mjs`、`tests\home-page-static.test.mjs`；`README.md` 追加一节「个人空间页面（A4p）」。**不要改**任何已有文件（含 `app.js / ui.js / index.html / server.mjs / quality.js / office-layout.js`）。备份：无需（只新增文件），在汇报里写明。**静态服务白名单需允许 `.html`（`home-items-gallery.html` 已能访问，沿用）；不得新增服务端路由；不得向 Paperclip 发请求。**

## 要做的事
1. **`home-room-geometry.mjs`（纯函数，不引用 THREE / DOM）**：`ROOM = { cellsW:16, cellsD:12, cellM:0.5, wallH:3.0, wallT:0.12 }`；`cellToLocal(cx, cz)`（原点在房间中心、地面 `y=0`；`cx` 向东、`cz` 向南）、`localToCell(x, z)`（越界返回 `null`）、`doorOpening()`（南墙正中 `cx 7…8`，宽 1.0 m、高 2.2 m）、`wallSegments()`（四面墙矩形片段，南墙在门洞处断开）、`placementTransform(placement, itemDef)` → `{ x, z, rotY }`（占用矩形中心 + 绕 Y 旋转，`rot=0` 正面朝南）、`roomBounds()`。
2. **`home-room.js`**：`createHomeRoom(THREE, { scene, materials, itemBuilder })` → `{ group, setPlacements(list, catalog), cellToWorld(cx, cz), focusGoal(), dispose() }`：浅木地板（16×12 格细网格纹理）、四面墙（**南墙留门洞**，门廊 1 m）、踢脚线、**无屋顶**（俯视可见）、入口净空区淡色标记、**不新增任何 `THREE.Light` 之外的灯**（页面自带一盏环境光 + 一盏平行光即可，**这是独立页面，不影响主场景**）；`setPlacements` 用 `buildItem` 摆放（A7 的原点约定：占用矩形中心），**传入前必须用 `validateLayout` 校验，非法项丢弃并 `console.warn` 一次，不崩溃**；同一 `itemId` 超过 8 件用 `InstancedMesh` 或合并。
3. **`home.html` + `home-page.js`**：页面标题「个人空间（示意）」；全屏画布 + 深 / 浅主题切换 + 相机轨道（拖动旋转、滚轮缩放，俯视约 55° 起始，能看到整个 8×6 m 房间与门）；**默认显示一个演示布置**（`defaultLayout` + 用 `starterInventory` 摆几件，**仅在页面内存里**，不请求任何接口，不读写文件）；左下角小图例：「演示数据，刷新后不保留」；**`?items=gallery`** 可切换到 12 件物品排开展示（可选）。**页面不得请求任何 `/state`、`/town/...`、`/act` 接口**（A5b 才接）；不引入外部素材 / 联网。
4. **性能与隔离**：页面自带渲染循环，`document.hidden` 时暂停；窗口缩放自适应；页面卸载时 `dispose` 全部几何 / 材质 / 纹理；**主页面 `index.html` 与任何已有文件零改动**。

## 测试
- 几何：`cellToLocal / localToCell` 往返（全部 192 格）；`wallSegments` 南墙在 `cx 7…8` 断开且其余墙封闭；`doorOpening` 尺寸；`placementTransform` 四个旋转 × 非对称物品（`bed_single`）的中心与 `rotY`，**占用矩形与 `occupiedCells` 的包围矩形一致**。
- 静态：`home-room-geometry.mjs` 不含 `THREE / document / fetch / Math.random / Date.now`；`home-room.js`、`home-page.js` 不含 `innerHTML / eval / fetch(`、`buy / price / balance / wallet`；`home.html` 无外部域引用；**既有文件未被改动**（对比文件清单：只新增 5 个文件 + README 追加）。
- 全量 `node --test tests/*.test.mjs` 全过，不得放宽既有断言。

## 验收（缺一不通过）
- `node --input-type=module --check` 对三个 JS / MJS；浏览器（页面聚焦）打开 `http://office.localhost:3200/home.html`：空房间与摆放演示布置的截图（深 / 浅各一张）、门洞与入口净空区可见、控制台 0 错误、网络面板确认**除静态资源外没有任何请求**、`document.hidden` 暂停有效；**同时打开主页面确认加载正常、无错误条**（独立页面不得影响它）。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致。**不要自己重启服务。**
