# NAV-2-unified-place-naming：地点统一命名 `?place=<租户>-<类型>`（Trae；小卡，约 1.5 小时）

**董事会 2026-10-22 指示：** 办公室、仓配使用统一命名，以后多租户时由用户填入对应名称，例如 `drlife-office`；仓配叫 `drlife-warehouse`；**旧写法保留兼容**；办公室、仓配都使用新场景。
**执行者：Trae。** 前置：NAV-1d 已验收（2026-10-22）。**热点文件 `app.js / ui.js / index.html` 已交还 Codex 会话一：本卡不改它们**；若确实需要改，先停下写明理由，由我与 Codex 会话一协调。本卡只动 `place-mode.js`、`place-bar.js`、`town.js`、`town-map-core.js` 及其测试与文档。

先读：`_common.md`、`NAV-1-town-two-places.md`、`NAV-1d-dr-place-mode.md`、`place-mode.js`（`resolvePlaceMode`）、`place-bar.js`（`PLACE_NAVIGATION`）、`town.js` 里地标点击跳转、`tests\place-mode.test.mjs`、`tests\town-nav.test.mjs`。

## 命名规则
1. **新格式：** `?place=<tenant>-<kind>`。`kind` ∈ `office`、`warehouse`；`tenant` 为租户短名，正则 `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$`（小写字母、数字、连字符，最长 32，不以连字符开头或结尾）。解析时**以最后一个连字符分隔出 kind**（`drlife-office` → tenant `drlife`、kind `office`）。
2. **旧格式全部保留，行为逐项不变：** `?place=office`、`?place=dr`、`?campus=1&place=dr`、`?campus=1` 单独出现、不带参数的默认页面。旧写法与新写法解析结果的等价关系写成表格进测试：`office` ≡ `drlife-office`（租户默认 `drlife`），`dr` ≡ `drlife-warehouse`。
3. **未知 / 非法 / 重复参数一律回退办公室，且不报错**（沿用 NAV-1d 的参数矩阵规则）：未知 kind（如 `drlife-shop`）、非法字符、超长、大写、`place` 出现两次。
4. **租户名目前只认 `drlife`**（多租户隔离 F01 还没做，**不得**因此显示或暗示存在其它公司）；未知租户（如 `acme-office`）按第 3 条回退办公室默认页。租户注册表留给多租户阶段，本卡只在 `place-mode.js` 里放一个**冻结的常量表**（目前仅 `drlife`），并写明「将来由多租户配置替换」。
5. **「新场景」的含义与落地顺序（重要）：**
   - **仓配（`drlife-warehouse` 与旧 `dr`）：** 已经是新园区场景，无需改动场景。
   - **办公室（`drlife-office` 与旧 `office`）：** 目标是 rev3 场景（`?layout=3`）。但 rev3 在 R3-7 通过并经董事会批准之前**不是默认**。所以 `resolvePlaceMode` 对办公室返回一个新字段 `layout`：现在是**当前默认值**（与改前一致），并在常量里标注「R3-7 验收后由规划者改为 3」；`app.js` 暂不读取这个字段。**不要**在本卡里让新格式 URL 直接开启 `?layout=3`。
6. 新格式地点的页面标题、品牌、面板沿用现有：`drlife-warehouse` = NAV-1d 的仓配模式（无办公室字样）；`drlife-office` = 现有办公室页面。

## 要做的事
1. 改 `resolvePlaceMode(search)`：支持新格式；返回值新增 `placeId`（规范化后的新格式，如 `drlife-office`）、`tenant`、`kind`、`legacy`（是否旧写法）、`layout`。现有字段与旧写法的返回值**逐项不变**（用快照测试证明）。
2. **链接统一用新格式：** `/town.html` 地标点击跳转、`place-bar.js` 的「返回小镇 / 前往另一地点 / 调度中心」链接、`PLACE_NAVIGATION` 全部改为新格式 URL（`/?place=drlife-office`、`/?place=drlife-warehouse`）；**保留**对旧 URL 的解析。小镇 API 返回的地标 id（`office-zixu-workshop`、`dr-logistics-campus`）**不改**，只映射到新格式 URL。
3. `sessionStorage` 的镜头记忆键从 `office3d.camera.dr` 起按 `placeId` 区分（旧键读取兼容一次，不报错）。`try/catch` 保持。
4. **测试：** 参数矩阵（新、旧、非法、大小写、重复、未知租户、未知 kind、超长）；旧写法返回值与改前逐项相同（快照）；链接改写；`place-bar` 渲染的 `href`；全量 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/*.test.mjs` 全过（**不要不带路径跑**，备份目录里有旧测试副本）。
5. **浏览器验收（Playwright，用完即删截图）：** 新旧两种写法各打开办公室与仓配，页面内容一致；`/town.html` 点击两个标记进入新格式 URL；后退（启用后退缓存）无白色遮盖；`?place=acme-office` 与 `?place=drlife-shop` 回退办公室且控制台 0 错误。

## 约束与汇报
- 不新增接口、不新增轮询、零 token；不改默认页面与 `?layout=2` 行为；不读取或打印密钥，不重启服务。
- 备份改动的既有文件到上一级目录 `office3d-backup-nav-2`。
- 「做到 / 没做到 / 未验证」，**停下等我验收**。
- 验收通过后，我把「办公室 `layout` 值改为 3」登记为 R3-7 的收尾项。
