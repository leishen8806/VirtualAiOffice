# A5a-home-page-editor：个人空间页面的摆放交互——选取 / 放置 / 旋转 / 移动 / 删除 / 撤销（内存态，约 1.5–2 小时）

**执行者：Trae（新会话）。小镇线。** **本卡取代原 `A5a-home-placement-ui.md`**（原卡依赖已作废的 A4 与 `app.js`；本卡在**独立页面 `home.html`** 里实现，不改 `app.js`）。**前置：A4p 已验收（`home-room.js / home-room-geometry.mjs / home.html / home-page.js`）。** 先读：`_common.md`、`_lane-main.md`、`_lane-town.md`、`docs\home-space-spec.md`（全文）、A4p 的四个文件、`town\home-space.mjs`（`canPlace / placeItem / moveItem / rotateItem / removeItem / validateLayout / starterInventory`）、原 `A5a-home-placement-ui.md`（**交互需求可直接参考**：预览红 / 绿、撤销栈 50 步、托盘、触屏、键盘）。

**允许修改：** `home.html`、`home-page.js`、`home-room.js`（**只增加编辑所需的接口，不改已有行为，逐项列出**）；新增 `home-editor.js`、`home-editor-logic.mjs`（**纯逻辑，Node 可测**）、`tests\home-editor-logic.test.mjs`；README 一节。**不要改** `app.js / ui.js / index.html / server.mjs / quality.js / town\`。备份 `home.html`、`home-page.js`、`home-room.js` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-a5a`（上一级目录）。**不得请求任何接口；布置只在页面内存里，通过可替换的 `persistAdapter` 留给 A5b。**

## 要做的事
1. **`home-editor-logic.mjs`（纯函数，不引用 THREE / DOM）**：`pointerToCell(local, item, rot)`（指针局部米坐标 → 物品最西北格；占用矩形以指针为中心、吸附 0.5 m 格；越界钳制到最近合法位置）、`previewState(layout, inventory, candidate)` → `{ ok, violations, cells, reasonText }`（内部调用 `canPlace`；`reasonText` 是一行中文原因，如「会挡住入口」「超出房间」「与书桌重叠」「墙面物品要贴墙」「会把通道堵死」）、`createHistory({ limit: 50 })`（`push / undo / redo / canUndo / canRedo / reset`，**快照不可变、不写盘**，超过 50 步丢最旧，新操作清空重做栈）、`trayModel(inventory, layout)`（每个 `itemId` 的「拥有 / 已摆放 / 剩余」，剩余 0 标不可再放）、`restoreDefault(layout)`（清空 `placements`，库存不变）。
2. **`home-editor.js`**：`createHomeEditor({ THREE, scene, camera, renderer, controls, room, persistAdapter })` → `{ open(), close(), getLayout(), setLayout(layout, inventory), dispose() }`：
   - **底部物品托盘**（12 种，显示剩余数）+ **顶部工具条**（旋转 ↻ ↺、删除、撤销、重做、恢复默认（二次确认）、完成）；**文案不得出现「购买 / 价格 / 余额」**。
   - **放置**：点托盘物品 → 地板上跟随指针的半透明预览，**合法绿 / 非法红 + 一行中文原因**；点击合法位置放下；**拖动期间暂时禁用轨道控制，松手恢复**。
   - **选中**：点击已摆放物品选中（描边高亮），可拖动移动、`R` 旋转 90°、`Delete` 删除；`Ctrl/Cmd+Z`、`Ctrl/Cmd+Y` 撤销 / 重做；`Esc` 取消放置 / 取消选中。
   - **完成**：把最终布局交给 `persistAdapter.save(layout)`；**默认适配器是空操作，并在界面提示「尚未接入保存，刷新后不保留」**；适配器失败只提示，不丢当前布局、不抛异常。
   - **键盘与触屏**：托盘与工具条可用键盘操作（Tab 顺序、`aria-label`）；触点拖动等价鼠标；窄屏（≤ 480 px）工具条不遮挡房间；深浅主题下对比清晰。
3. **隔离与卫生**：编辑器 DOM 用独立容器，值一律用 `textContent`；`close() / dispose()` 移除全部监听；**切走页面 / `document.hidden` 不报错**；**所有入口 `try/catch`，失败只降级编辑器**。

## 测试
- `pointerToCell`：四个旋转 × 非对称物品、贴边与越界钳制、吸附；`previewState`：规则各一例合法 / 非法且原因文案非空，覆盖入口净空区、封死通道、`wall` 层贴墙；历史栈：撤销重做顺序、上限 50、新操作清空重做栈、快照不可变；`trayModel`：起始库存数量（`chair_wood` 3、`plant_pot` 2、`frame_art` 2、其余 1）、摆放后递减、删除后恢复。
- 静态：`home-editor-logic.mjs` 无 `THREE / document / window / fetch / Math.random / Date.now`；`home-editor.js` 无 `innerHTML 拼外部数据 / eval / fetch(`、无 `buy / price / balance / wallet`。
- 全量测试全过，不得放宽。

## 验收（缺一不通过）
- 浏览器（页面聚焦，Playwright 可）：从托盘放置全部 12 种物品（含多件木椅）、拖动移动、旋转四向、删除、撤销到底再重做到底、恢复默认；**故意制造 5 类非法**（越界、重叠、挡入口、封死通道、墙面物品不贴墙）并截图红色预览与提示；深 / 浅主题各一张；**375 px 窄屏一张**；控制台 0 错误；网络面板确认**无接口请求**；主页面不受影响（打开确认加载正常）。
- **泄漏检查**：`open → 放置若干 → close` 前后 `renderer.info.memory.geometries / textures` 与场景对象数一致。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致。**不要自己重启服务。**
