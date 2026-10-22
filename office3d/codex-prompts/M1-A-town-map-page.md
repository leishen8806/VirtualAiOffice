# M1-A-town-map-page：独立的「金边小镇」地图页（只读底图，Canvas 2D，无服务端改动）

**建议执行者：Codex 5.6 Sol（前端 / 性能）；也可由 Trae 执行。** 先读 `_common.md`，再读 `E:\VirtualAIOffice\paperclip-ops\town-map-data\m0\m0-plan.md` 的**第 3、4、9、10、11 节**，以及 `town-map-data\osm-raw\README.md`（来源与许可）。**本任务与 S1-1（改 `office-layout.js`）、S1-2（改 `server.mjs`）文件互不重叠，可以并行**；但**不得与任何改 `server.mjs` / `app.js` 的任务同时改这两个文件——本任务根本不碰它们。**

## 本任务的例外规则
- **只允许新增**（办公室目录 `office3d\` 内）：`town.html`、`town.js`、`town.css`、`town-map-data.js`、`tests/town-map.test.mjs`、`tools/make-town-map-module.mjs`；允许修改 `README.md`（加一节）。
- **不得修改**：`app.js`、`ui.js`、`index.html`、`office-layout.js`、`director.js`、`server.mjs`、所有业务模块、`town\` 目录（T20 经济引擎）、`town-map-data\` 下任何已有文件（`osm-raw\` 与 `m0\` 只读）。
- **不得联网**（不引入地图瓦片、字体、CDN、脚本）；不新增依赖；不向 Paperclip 发任何写请求；不启动 / 停止服务（服务已在 `127.0.0.1:3200` 运行，用浏览器访问 `http://office.localhost:3200/town.html` 验证）。
- 备份：本任务只新增文件，不需要备份；`README.md` 改前复制到 `office3d-backup-m1a\`。

## 为什么这样做（约束的来源）
- 现有静态服务白名单**不含 `.json`**，所以地图数据**不能**当 JSON 文件直接 fetch；也**不改 `server.mjs`**（`/town/map` 接口和 `/town` 路由是 M1-B 的事）。因此：用 `tools/make-town-map-module.mjs` 把 `town-map-data\m0\derived\town-map-v0.json` **原样**转成 `town-map-data.js`（`export default {…}`，内容与源文件逐字段一致），页面用 `import` 载入。M1-B 之后再切换成接口，页面的数据入口要写成**一个可替换的函数** `loadMap()`。
- 页面此刻通过 `/town.html` 访问（`/town` 路由等 M1-B）。**办公室页面不加入口**（不改 `app.js`），入口等 M1-C 之后由董事会决定。`town.html` 里放一个指回 `/` 的普通链接「← 回到办公室」。
- 这是 **ODbL 数据**：界面必须**始终可见**地显示 `© OpenStreetMap contributors`，并提供指向 ODbL 说明的链接（`https://www.openstreetmap.org/copyright`，普通 `<a target="_blank" rel="noopener noreferrer">`）。

## 要做的事
1. **数据模块**：`tools/make-town-map-module.mjs`（Node，本地运行，只读 `m0\derived\town-map-v0.json`，写 `town-map-data.js`）。生成物首行注释写明来源与「© OpenStreetMap contributors，ODbL 1.0」。`town-map-data.js` 体积应与源 JSON 同量级（≈ 200 KB）。
2. **页面 `town.html / town.css / town.js`**（原生 ES 模块，无依赖，深色 / 浅色沿用办公室页面的 CSS 变量思路并自带一份变量，不要 `@import` 外部资源）：
   - **Canvas 2D 绘制顺序**：背景 → 水系 → 区界填充与边界（14 个 Khan 用有区分度但克制的色调，深浅主题各一套）→ 道路（按 `highway` 等级分粗细：motorway/trunk > primary > secondary）→ **智序工场标记**（虚构位置，见 m0 第 3 节，投影点 `(2614,-1468)` 米；标签旁加「虚构位置」小字）→ 地标点 → 选中态。
   - **坐标**：数据已经是米制局部平面（x 向东，y 向北），绘制时只在视图变换里翻转 y；1 画布单位 = 10 米；缩放范围 0.35–8 倍；初始视野恰好装下 14 个 Khan（fit）。
   - **交互**：鼠标滚轮以光标为中心缩放；拖动平移；点选地标或 Khan（命中测试写成纯函数，可单测）；键盘 `+` `-` 缩放、方向键平移、`Esc` 取消选中、`0` 回到初始视野。触屏双指缩放 / 单指平移（用 Pointer Events，不必实现惯性）。
   - **详情面板**（HTML，不画在 Canvas 上）：显示选中项的名称、类型、所在 Khan、经纬度；**所有来自数据的文字只用 `textContent` / Canvas `fillText`，禁止 `innerHTML` 拼接**；名称为空显示「–」，不得出现 `undefined` / `NaN`。
   - **标签**：Khan 名称在中等缩放以上显示，地标名在更高缩放才显示；按视口裁剪、同层标签之间做简单的碰撞避让（不重叠即可，不要求最优）。可疑地标（`Baby Mckie Shop`、`(stupa)`，见 m0 第 2 节「默认隐藏」）**默认不显示**；用一个常量数组 `HIDDEN_LANDMARKS` 表示，便于以后调整。
   - **署名条**：固定在**右下角**，`z-index` 高于所有面板，面板和详情**不能遮挡它**；窄屏（390 px）也要完整可见。
   - **性能**：静态底图（水系、区界、道路）画到**离屏 canvas**，视图变化时按需重绘；用 `requestAnimationFrame` 且**只在视图 / 选中 / 窗口大小变化时重绘**（不要空转的 60 FPS 循环）；`devicePixelRatio` 上限取 2；页面隐藏时不绘制；缩放 / 拖动期间可以降低标签密度。写一个 `?perf=1` 调试开关，在角落显示最近 60 帧的平均帧耗时（默认不显示）。
   - **降级**：数据载入失败（import 报错）时页面显示明确的中文提示和「重新加载」按钮，不白屏；`prefers-reduced-motion` 时缩放不做动画。
   - **可访问性**：Canvas 有 `aria-label`；详情面板用 `aria-live="polite"`；所有按钮可键盘操作；缩放按钮（＋ − ⌂）放在左下角。
3. **README**：新增一节「金边小镇地图（M1-A）」：访问地址（`/town.html`）、数据来源与署名要求、如何用 `tools/make-town-map-module.mjs` 重新生成、已知限制（无接口、无居民、无通勤；入口待董事会决定）。

## 测试（`tests/town-map.test.mjs`，纯函数 + 静态检查，不依赖浏览器）
把可测的逻辑拆成**不依赖 DOM** 的纯函数，放在 `town.js` 里导出，或拆到 `town-map-core.js`（本任务允许多新增这一个文件，需在汇报里列出）：
- 投影 / 视图变换：世界 ↔ 屏幕往返一致；以光标为中心缩放时光标下的世界点不动；缩放被夹在 0.35–8；`fit` 后 14 个 Khan 的包围盒完全落在视口内。
- 命中测试：点在地标附近返回该地标、点在 Khan 内返回该 Khan、空白处返回 `null`；隐藏地标不可被点选。
- 数据：`town-map-data.js` 与 `m0\derived\town-map-v0.json` **逐字段一致**（`JSON.stringify` 比较或哈希）；四个图层非空；14 个 Khan、24 个地标；所有坐标是有限整数；文件头含「OpenStreetMap contributors」与「ODbL」。
- 静态检查：`town.html` 含署名文字与 ODbL 链接（`rel` 含 `noopener`）；`town.js` / `town-map-core.js` 中**没有** `innerHTML`、`eval`、`new Function`、`document.write`、`fetch(`、`XMLHttpRequest`、`WebSocket`、外部 `http(s)://` 脚本 / 样式引用（`openstreetmap.org/copyright` 这一条链接除外）；`town.css` 没有 `@import`、外部 `url(http…`。
- 总资源体积：`town.html + town.css + town.js(+core) + town-map-data.js` 之和 **≤ 2 MB**（预期远小于）。
- 标签避让：给定一组重叠标签，输出不重叠。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` **全过**（不得放宽或删除已有断言）；`node --check tools/make-town-map-module.mjs`；`node --input-type=module --check < town.js`（及 `town-map-core.js`）。
- **浏览器实测**（`http://office.localhost:3200/town.html`，Ctrl+F5）：
  1. 初始画面截图：14 个 Khan、河流、道路、智序工场标记（带「虚构位置」）、右下角署名与 ODbL 链接可见；
  2. 缩放（滚轮 + 键盘 `+` `-`）、拖动、`0` 复位、点选独立纪念碑和王宫（详情面板内容正确，点选后选中态可见）、点选一个 Khan；
  3. 切换系统深色 / 浅色（或用 `colorScheme` 模拟）各截一张；
  4. **390 px 宽度**截图：署名完整可见、缩放按钮可点、详情面板不遮挡署名；
  5. 控制台 **0 错误 0 警告**；`?perf=1` 读数：整图 fit 视野下**平均帧耗时 < 16 ms**（桌面）并把读数写进汇报；**低配判断**：用 `resize_window` 或 DevTools 节流（CPU 4× 降速，若不可用则写「未验证」）报告帧耗时，目标 ≤ 33 ms（≥ 30 FPS）；做不到就如实写，不要编造；
  6. 确认**办公室主页 `/` 没有任何变化**（本任务不改它），`/state` 等接口响应不受影响（只做 GET 对比）。
- 汇报（按 `_common.md` §5 的格式）：每条要求做到没有；没做到的原因；新增文件清单与体积；`town-map-data.js` 与源 JSON 一致性的证据；性能读数（含「未验证」项）；**地图看起来哪里不对 / 哪里可读性差**（比如河流、地标分布、Khan 配色）——这是 M1-A 要给董事会的核心证据，写具体；**你觉得 M1-B（`/town/map` 接口与 `/town` 路由接线）需要注意的点**。
- **不要自己结束或重启任何进程；本任务不需要重启服务。**
