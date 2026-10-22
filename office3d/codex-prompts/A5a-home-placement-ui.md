# A5a-home-placement-ui：个人空间摆放交互——选取 / 放置 / 旋转 / 移动 / 删除 / 撤销（纯前端，内存态，约 1.5 小时）

> **【2026-10-21 夜：本卡已被 `A5a-home-page-editor.md` 取代，请勿再派发。】**

**执行者：Codex（新会话）。小镇线 · 场景与交互。改 `app.js`（同一时间只有一个任务改它）。** **前置：A4、A7、A1 均已验收**（`home-room.js`、`home-items-3d.js`、`town\home-space.mjs`）；缺任一项先停下汇报。**本任务不接服务端、不读写任何文件、不发任何网络请求**：布置只在页面内存里，通过一个可替换的 `persistAdapter` 接口留给 A5b 接入存储（A3 / A2 落地后）。先读：`_common.md`、`_lane-town.md`、`docs\home-space-spec.md`（全文）、`home-room.js`、`home-items-3d.js`、`town\home-space.mjs`（`canPlace / placeItem / moveItem / rotateItem / removeItem / validateLayout / starterInventory`）、`app.js` 里已有的点选 / 射线拾取写法与 `OrbitControls`（或同类）的接管方式。

**允许修改：** `app.js`（**最小接线 ≤ 20 行，逐行列出**）、新增 `home-editor.js`、`home-editor-logic.mjs`（**纯逻辑，可在 Node 测试**）、`tests\home-editor-logic.test.mjs`；`README.md` 追加一节「个人空间摆放（A5a）」。**`ui.js` / `index.html` 能不动就不动；确需最小钩子 ≤ 10 行并逐行列出**（编辑面板用 `home-editor.js` 自己创建的独立容器）。**不要改**：`server.mjs`、`quality.js`、`merge.js`、`director.js`、`office-layout.js`、`env.js`、`town\`、所有业务模块。备份 `app.js` 到 `office3d-backup-a5a`。**不需要重启服务；不得向 Paperclip 发请求。**

## 要做的事
1. **`home-editor-logic.mjs`（纯函数，不引用 THREE / DOM）**：
   - `pointerToCell(local, item, rot)`：把房间局部坐标（米）转成「物品最西北格」的 `(cx, cz)`，使物品**占用矩形以指针为中心**并**吸附到 0.5 m 格**；越界时钳制到最近的合法位置。
   - `previewState(layout, inventory, candidate)` → `{ ok, violations, cells }`（内部调用 `canPlace`），用于绿 / 红预览。
   - **撤销 / 重做栈**：`createHistory({ limit: 50 })` → `push(layout) / undo() / redo() / canUndo / canRedo / reset(layout)`；超过 50 步丢弃最旧；新操作清空重做栈；**栈只存不可变布局快照，不写盘**（规格 5 节）。
   - `trayModel(inventory, layout)`：物品托盘数据——每个 `itemId` 的「拥有数 / 已摆放数 / 剩余数」，剩余 0 时标记不可再放。
   - `restoreDefault(layout)`：清空 `placements`（库存不变）。
2. **`home-editor.js`**：`createHomeEditor({ THREE, scene, camera, renderer, controls, room, itemBuilder, persistAdapter })` → `{ open(), close(), isOpen(), getLayout(), setLayout(layout, inventory), dispose() }`：
   - `open()`：仅当房间已 `enter()`（A4）时可用；进入**编辑模式**：显示底部 / 侧边**物品托盘**（12 种，显示剩余数）、顶部工具条（旋转 ↻ ↺、删除、撤销、重做、恢复默认、完成）；镜头切到俯视；**原有轨道控制器在拖拽物品时暂时禁用，松手恢复**。
   - **放置**：点托盘里的物品 → 在地板上跟随指针显示半透明预览（**合法绿、非法红**，非法时给出一行中文原因，如「会挡住入口」「超出房间」「与书桌重叠」）；点击合法位置放下。
   - **选中已摆放物品**：点击选中（描边高亮），可**拖动移动**（拖动期间预览同上）、旋转（`R` 键 / 工具条，90° 一步）、删除（`Delete` / 工具条）。
   - **撤销 / 重做**：`Ctrl+Z / Ctrl+Y`（Mac 对应 `Cmd`）与按钮；上限 50 步。
   - **恢复默认**：二次确认后清空摆放（库存不变），可撤销。
   - **完成**：关闭编辑模式，把最终布局交给 `persistAdapter.save(layout)`（A5a 里的默认适配器是**空操作并在界面提示「尚未接入保存，刷新后不保留」**）；`persistAdapter` 失败只提示，不抛异常、不丢当前布局。
   - **键盘与可访问性**：托盘与工具条可用键盘操作（Tab 顺序合理，按钮有 `aria-label`）；`Esc` 取消当前放置 / 退出选中；深浅主题下文字对比清晰。
   - **触屏**：触点拖动等价于鼠标拖动；长按 = 选中；避免与页面滚动冲突（编辑容器 `touch-action` 合理设置）；窄屏（≤ 480 px）工具条不遮挡房间主体。
3. **渲染与性能**：预览与选中描边使用**共享材质**；放置 / 移动期间物品**临时**标 `userData.dynamic = true`，**完成 / 取消后清除**并通知画质合并（沿用 `quality.js` 现有接口，**只读使用，不改它**）；编辑模式**不新增光源**；**关闭编辑模式后场景对象数、`renderer.info.memory` 与打开前一致**（无泄漏）。
4. **隔离**：编辑模式不拦截 `/state` 轮询、治理中心、任务面板；编辑中切走页面（`document.hidden`）不报错；所有事件监听在 `close()` / `dispose()` 时移除；入口全部 `try/catch`，失败只降级编辑器本身。
5. **文案红线**：界面与代码不得出现「购买 / 价格 / 余额 / buy / price / balance / wallet」；不涉及 DR 币。

## 测试（`tests/home-editor-logic.test.mjs`）
- `pointerToCell`：四个旋转 × 非对称物品；贴边与越界钳制；吸附到 0.5 m 格；与 `occupiedCells` 的包围矩形一致。
- `previewState`：每条规则一例合法 / 非法，原因文案非空；入口净空区、封死通道、`wall` 层贴墙各一例。
- 历史栈：撤销 / 重做顺序；上限 50（第 51 步丢最旧）；新操作清空重做栈；`reset` 清栈；快照不可变（修改返回值不影响栈内）。
- `trayModel`：初始库存数量（`chair_wood` 3、`plant_pot` 2、`frame_art` 2、其余 1）；摆放后剩余数递减；删除后恢复。
- 静态检查：`home-editor-logic.mjs` 不含 `THREE / document / window / fetch / Math.random / Date.now / performance.now`；`home-editor.js` 与 `app.js` 新增行不含 `innerHTML / eval / fetch(`、不含 `buy / price / balance / wallet`；`app.js` 新增 ≤ 20 行。
- 全量 `node --test tests/*.test.mjs` 全过，不得放宽已有断言。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check` 对 `app.js`、`home-editor.js`、`home-editor-logic.mjs`。
- **浏览器实测**（页面聚焦；`?home=1` 进入房间后 `window.__office.home` 调用编辑器 `open()`）：从托盘放置全部 12 种物品（含多件 `chair_wood`）、拖动移动、旋转四向、删除、撤销到底再重做到底、恢复默认；**故意制造 5 类非法**（越界、重叠、挡入口、封死通道、`wall` 物品不贴墙）并截图红色预览与提示；深 / 浅主题各一张；**窄屏 375 px 一张**；控制台 0 错误。
- **泄漏检查**：`open → 放置若干 → close` 前后对比 `renderer.info.memory.geometries / textures` 与场景对象数一致；**不进入房间时**办公室 / 广场 / 小地图的 calls 与对象数与改动前一致。
- 成对性能：编辑模式下（12 件摆满）高档 ≤ +30 calls、低档 ≤ +12 calls（与 A4 同口径，页面渲染循环内读 `renderer.info`，等 6 秒以上）。
- 汇报「做到 / 没做到 / 未验证」且与磁盘一致；**`app.js` 与（如有）`ui.js` / `index.html` 的接线行逐行列出**；说明默认适配器的提示文案。**不要自己重启服务。**
