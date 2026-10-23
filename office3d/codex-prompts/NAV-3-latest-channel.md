# NAV-3-latest-channel：从小镇进入办公室 / 仓配，一律用「最新版本」展示（Trae；小卡，约 1 小时）

**董事会 2026-10-22 指示：** 小镇里的办公室、仓配都要用最新版本展示，要能直接看到最新效果。
**执行者：Trae。** 前置：NAV-2 已验收。**不改 `app.js / ui.js / index.html`（Codex 会话一正在做 R3-3b，独占这三个文件）、不改任何场景模块**；只动 `place-mode.js`、`place-bar.js`、`town.js`、`town-map-core.js`、`dr-place-view.js` 及其测试与文档。

先读：`_common.md`、`NAV-2-unified-place-naming.md`、`place-mode.js`、`place-bar.js`、`town.js` / `town-map-core.js` 里地点跳转、`dr-place-view.js`、`office-layout.js` 的 `resolveOfficeLayout`（它直接读 `?layout=`，不经过 `place-mode`）、`tests\place-mode.test.mjs`、`tests\town-nav.test.mjs`。

## 「最新版本」的定义（单一事实来源）
在 `place-mode.js` 新增一个**冻结常量表** `PLACE_LATEST`，作为「最新版本通道」的唯一定义，**以后换版本只改这里一处**：
- `office`：`{ layout: 3 }`（rev3 场景，进度随 R3-x 推进，当前是 R3-3b 前后的外壳阶段）。
- `warehouse`：`{}`（仓配当前最新就是现有园区场景；`campusMotion` 默认已开，不需要额外参数。以后有新开关写在这里）。
- 注释写明：「这是展示通道，不是默认页面；默认页面（不带 place 参数的 `/`）与直接输入的 `?place=drlife-office` 仍保持现状，直到董事会批准 rev3 为默认」。

## 要做的事
1. **导出 `latestSearch(placeId)`：** 返回该地点进入时应带的完整查询串（例如 `drlife-office` → `?place=drlife-office&layout=3`，`drlife-warehouse` → `?place=drlife-warehouse`）；对未知 placeId 回退办公室并不抛错。
2. **所有「进入地点」的入口统一走 `latestSearch`：** `/town.html` 地标点击跳转、`place-bar.js` 的「前往另一地点 / 返回」链接与 `PLACE_NAVIGATION`、仓配页里「调度中控室」入口（见第 4 条）。
3. **`resolvePlaceMode` 对 `layout` 参数的处理：** `?place=drlife-office&layout=3`、`?place=drlife-office&layout=2`、`?place=office&layout=3` 都按办公室解析，返回值里 `layout` 字段**如实反映 URL 里的数字**（`1 / 2 / 3`，非法值忽略为默认 1），且**不触发「未知参数回退」**；仓配地点忽略 `layout`。NAV-2 的全部参数矩阵与旧写法返回值**逐项不变**（快照测试）。
4. **顺手收尾 NAV-2 的小问题：** `dr-place-view.js` 里「进入调度中控室 / 返回」链接改为新格式（`/?place=drlife-warehouse&controlRoom=1` 与 `/?place=drlife-warehouse`），并保证 `resolvePlaceMode` 对 `?place=drlife-warehouse&controlRoom=1` 与旧写法 `?campus=1&place=dr&controlRoom=1` 解析结果相同（测试固定）。**不要改 `index.html`**；`index.html` 里那条静态旧链接由 JS 覆盖，留给 Codex 会话一在 R3-3b 之后清理（写进汇报）。
5. **可见的版本提示：** 地点页顶栏的副标题（现有 `connText` / 品牌副标题位置，不新增 DOM 结构）在办公室 `layout=3` 时显示「最新版 · rev3 开发中」，其它情形不变；仓配不加提示。该文案来自 `PLACE_LATEST`，不要写死在多处。
6. **测试：** `latestSearch` 全部地点与未知输入；入口链接断言（town 点击目标、place-bar `href`、dr-place-view 链接）都带上最新通道参数；`layout` 参数矩阵；NAV-2 既有测试全过；全量 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/*.test.mjs` 全过。
7. **浏览器验收（Playwright，用完即删截图）：** `/town.html` 点击办公室标记 → URL 为 `/?place=drlife-office&layout=3` 且页面是 rev3 场景（`window.__office.officeV3` 存在）；点击 DR 标记 → `/?place=drlife-warehouse`，仓配场景；在办公室点地点栏去仓配、再返回，URL 始终是最新通道；后退（启用后退缓存）无白色遮盖；默认页面 `/` 与直接输入 `?place=drlife-office`（不带 layout）仍是现有办公室，控制台 0 错误。

## 约束与汇报
- 不新增接口、不新增轮询、零 token；不改默认页面、`?layout=2` 行为；不读取或打印密钥，不重启服务。
- 备份改动的既有文件到上一级目录 `office3d-backup-nav-3`。
- 「做到 / 没做到 / 未验证」，**停下等我验收**。
- **汇报里如实写：** 进入办公室看到的 rev3 目前处于哪一阶段（Codex 会话一的 R3-3b / R3-4… 完成之前，画面是不完整的外壳），不要把未完成的画面描述成成品。
