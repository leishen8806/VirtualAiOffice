# M1-C-town-map-polish：金边地图页——改用接口取数 + 地名可读（英文 / 中文）+ 标签拥挤与标题重叠修复

**建议执行者：Trae（前端、边界清晰）；也可由 Codex 执行。** **前置条件已满足：M1-A（地图页）、M1-B（`/town`、`/town/map`）都已验收，服务已重启。** 先读 `_common.md`、`M1-A-town-map-page.md`、`M1-B-town-map-api.md`、`town.js`、`town-map-core.js`、`town.html`、`town.css`、`tests/town-map.test.mjs`、`tests/town-map-api.test.mjs`，以及 `town-map-data\m0\m0-plan.md` 第 2、9、11 节。

**例外规则：** 只允许修改 `town.html`、`town.js`、`town.css`、`town-map-core.js`、`README.md`（金边小镇地图一节），新增 `town-names.js`（地名对照表，见下）、`tests/town-map-polish.test.mjs`；允许**调整** `tests/town-map.test.mjs` 里与本任务直接相关的断言（改了要逐条列出理由，**不得放宽安全类断言**：无 `innerHTML / eval / fetch(外部) / 外部资源`、署名可见、总资源体积上限）。**不要改**：`server.mjs`、`town-map.mjs`、`town-map.json`、`town-map-data.js`（保留作为降级数据源）、`app.js`、`ui.js`、`index.html`、`town\`（经济引擎）、所有业务模块、`tenancy\`。备份被改文件到 `office3d-backup-m1c`。纯前端，**不需要重启服务**；**不得向 Paperclip 发任何写请求**，不联网、不装依赖。

## 本任务的边界
- **零 token 约束**（知识库第十八节）：地图页不得引用发评论 / 建任务 / 模型调用的任何东西；唯一允许的网络请求是同源 `GET /town/map`。
- 不做居民、通勤、地块、房产、经济（M2 以后）。地图仍是**只读底图**。
- OSM 署名仍须右下角固定可见，不被任何新增元素遮挡（含新的图例 / 切换按钮）。

## 要做的事
1. **改用接口取数**：`loadMap()` 改为 `fetch('/town/map')`（同源）：
   - 使用浏览器缓存与 `ETag`（不要手动禁用缓存）；响应体结构与 `town-map-data.js` 完全一致，**不得再做结构转换**；
   - **降级**：请求失败 / 状态非 200 / JSON 无效 / 缺少 `layers.khans|roads|water|landmarks` 任一 → **回退到 `import('./town-map-data.js')`**（现有行为），并在页面角落显示一行小字「使用本地备份地图」；两者都失败才显示现有的错误页和「重新加载」按钮；
   - **校验**：接口返回的数据必须通过与 `town-map.mjs` 相同口径的最小校验（四个图层为数组、`attribution` 含 `OpenStreetMap contributors` 与 `ODbL`）才使用；所有名称文字只用 `textContent` / Canvas `fillText`。
2. **地名可读**（董事会反馈：现在区名全是高棉文看不懂）：
   - 新增 `town-names.js`：`Khan` 英文名 → `{ zh, en }` 的对照表（14 个区，英文名取自数据里的 `name`，去掉前缀 `Khan `）、地标英文名 → 中文名的**手工对照表**（24 个地标里有把握的才写，**没把握的不要编造中文，只留英文**），文件顶部写明「中文名为手工整理，待董事会确认」。表是纯数据，**键必须能和数据里的 `name` 精确匹配**（测试固定：14 个区全部命中；地标命中数写进汇报）。
   - 标签显示规则：**默认「中文名（英文名）」两行或单行，没有中文就只显示英文**，**默认不再显示高棉文**；高棉文放进右侧详情面板作为一行「高棉文名」；加一个小开关「地名：中文 / English / 高棉文」（只影响标签，状态记在 `localStorage`，**用 try/catch 包住，读取失败按默认**）。
   - 详情面板：显示中文名、英文名、高棉文名（有则显示）、类型（把 `monument / castle / marketplace / mall / stadium / museum / hospital / station` 等类型翻译成中文）、所在 Khan。
3. **拥挤与重叠修复**（M1-A 的汇报里自己列出的问题）：
   - 中心城区标签：按 **缩放级别分层显示**——整图视野只显示 14 个区名；缩放 ≥ 1.35 才显示地标；再放大才显示次要地标；碰撞避让保持，**优先级** = 区名 > 智序工场 > 主要地标（独立纪念碑、王宫、中央市场、国家博物馆…）> 其它；被避让掉的标签**不要消失得突兀**（淡出）；
   - 左上角标题「金边小镇」与小字「DR LIFE+ · PHNOM PENH」**重叠**：重新排版，不再重叠（桌面与 390 px 都要检查）；
   - 道路层级在整图视野下偏细：motorway / trunk / primary / secondary 的线宽与颜色加强对比（深浅主题各调一次），整图视野下主干路清晰可辨。
4. **图例与说明（小而克制）**：左下角缩放按钮旁加一个可折叠的「图例」（区 / 道路 / 水系 / 地标 / 智序工场虚构位置），默认折叠；**不得遮挡署名**；智序工场标记旁继续保留「虚构位置」小字。
5. **README**：更新「金边小镇地图」一节（数据来源改为接口 + 降级、地名对照表如何维护、已知限制）。

## 测试（`tests/town-map-polish.test.mjs` + 调整后的 `town-map.test.mjs`）
- 地名表：14 个区全部命中数据里的 `name`；地标命中数；**没有重复键**；表里的值都是纯文本（无 `<`、`>`、控制字符）；中文缺失时回退英文。
- 取数与降级（用模拟 `fetch` / 动态导入，**纯函数化**：`loadMapWithFallback({fetchImpl, importImpl})`）：200 且有效 → 用接口；非 200 / 网络错误 / 非法 JSON / 缺层 → 回退本地并标记 `usedFallback:true`；两者都失败 → 抛出可被页面接住的错误；**绝不发出除同源 `/town/map` 以外的请求**。
- 标签分层：整图视野只含区名；缩放 ≥ 1.35 出现地标；优先级排序正确；避让后**不重叠**；`HIDDEN_LANDMARKS` 仍被排除。
- 类型翻译表覆盖数据里出现的全部类型（遍历 `town-map-data.js` 的 `landmarks[].type` 断言全部有中文）。
- 静态检查：无 `innerHTML / eval / new Function / document.write / XMLHttpRequest / WebSocket`；`fetch(` 只出现一次且目标是 `'/town/map'`；署名与 ODbL 链接仍在 `town.html`；总资源体积（html + css + js + 数据 + 新增文件）≤ 2 MB。
- 既有测试全过（`node --test tests/*.test.mjs`，当前基线 505 项起）。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check` 对所有改动的 `.js`。
- **浏览器实测**（`http://office.localhost:3200/town`，Ctrl+F5）：
  1. 网络面板确认只请求了 `/town/map`（带 `ETag`，二次加载 304）；把 `/town/map` 临时拦成失败（或用无法访问的路径模拟），确认**降级**到本地备份并显示小字提示；
  2. 整图视野截图：14 个区名可读（中文或英文），标题不再重叠，主干道清晰；放大到中心城区截图：标签不拥挤、优先级合理；
  3. 切换「地名：中文 / English / 高棉文」各截一张；点选独立纪念碑、王宫、Wat Phnom，详情面板信息齐全；
  4. 深色 / 浅色各一张；**390 px** 窄屏一张：署名、图例、缩放按钮不重叠；
  5. 控制台 0 错误；`?perf=1` 读数（桌面）；低配设备实测拿不到就写「未验证」。
- 汇报：每条做到没有；没做到的原因；**地名对照表中没把握而留空的条目清单**（请董事会确认）；类型翻译清单；性能读数；**仍然拥挤或不好看的地方**（具体写）。
- **不要自己结束或重启进程；不改 `server.mjs`。**
