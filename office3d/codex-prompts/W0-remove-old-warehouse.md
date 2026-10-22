# W0-remove-old-warehouse：拆除办公室门口左侧（DR 广场西侧）的旧仓库外壳（小卡，约 30–45 分钟）

> **【2026-10-21 傍晚：本卡已作废，请勿派发。】** 董事会改主意：旧仓库外壳不必单独拆除，随办公区整体更新一起处理——办公区 v2 切为默认时（O10 之后），旧址按 S2-9 处置（旧外壳并入新园区高位货架区、旧址改绿化 / 活动草坪预留）。

**执行者：Codex（会话一，`app.js` 链；排在 O3b 验收之后、O4 之前）。** **董事会 2026-10-21 指令：「空了把办公室门口（左侧的仓库拆除）」。** 这就是 S2-2 做的那座 28×12 m 仓库外壳（`x=-42…-14, z=17…29`，含月台、停车标线、物流门架、门牌、西侧绿化）。仓配产品已经决定迁到西路对侧的独立园区（`?campus=1`），旧外壳不再保留在办公室门口。**这是对默认页面的有意变更（旧仓库在默认页面里消失），董事会会亲自看效果，请把「拆除前 / 后」截图一并交付。**

先读：`_common.md`、`_lane-town.md`、`docs\dr-warehouse-plan.md` 与 `docs\dr-campus-plan.md` 第 3 节（旧外壳处置：并入新园区高位货架区作为内部模块——**所以 `warehouse-shell.js` 模块文件与它的纯数据测试要保留，日后由 S2-9 复用**）、`app.js` 里旧仓库的接线（`import { buildWarehouseShell }`、`const warehouseShell = buildWarehouseShell(...)`、小地图里三处 `rect(WAREHOUSE… / DOCK… / PARKING…)`、`window.__office.warehouseShell`）、`office-layout.js`（`WAREHOUSE / DOCK / PARKING / WEST_WALK / SERVICE_PASSAGE / CAMPUS_PAVING / LOGISTICS_GATE_ZONE / WAREHOUSE_ITEMS / WAREHOUSE_FOCUS / MINI_BOUNDS`，**常量一律保留**，S2-9 迁移时才处理）。开工前备份 `app.js` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-w0`（**上一级目录，必须备份**）。

## 要做的事（只拆「渲染与交互」，不动常量与模块）
1. `app.js`：**不再调用 `buildWarehouseShell`**（保留 `import` 会留下未使用导入，请一并移除或注释说明）；删除 `window.__office.warehouseShell`；小地图里旧仓库 / 月台 / 停车区三处轮廓**不再绘制**（`MINI_BOUNDS` 保持不变，避免影响小地图范围与既有测试；如需缩回，**列出并说明**）。**接线改动总行数逐行列出。**
2. **碰撞与路线**：旧外壳注册的碰撞体（墙体、月台、门框、西侧绿化）随之不再存在；**人物与小橘的路线不得受影响**（旧外壳本来就不在任何路线上）；`docs\dr-warehouse-checks.mjs` 与 `docs\dr-campus-checks.mjs` 两个检查脚本仍须 `PASS`（若检查脚本断言「外壳已接线」，只调整那一条断言并在汇报里写明理由；**不得放宽路线 / 重叠检查**）。
3. **留下什么**：原位置只剩环境铺装（保持既有地面）；**不新增任何建筑**；原先因仓库被移除的环境树木（`env.js` 的「生成后移除」特例）**暂不恢复**（S2-9 统一重排；本卡不碰 `env.js`，不改随机数序列）。
4. **不影响办公区 v2**：`?layout=2` 的外壳与 O3 / O3b 的一切保持不变；`?campus=1` 不受影响（园区是另一个模块）。
5. **测试**：`tests\warehouse-shell.test.mjs`（纯数据 `warehouseShellSpec / thinPartOffsets` 测试）**保留且仍通过**；若有测试断言「`app.js` 接线了 `buildWarehouseShell`」，改为断言「默认页面不再创建旧仓库外壳」，**逐条列出调整理由，不得放宽其它断言**；新增一条测试：默认页面静态检查 `app.js` 不再 import `warehouse-shell.js`，而 `warehouse-shell.js` 文件仍存在且导出不变（防止误删模块）。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check < app.js`；两个检查脚本 `PASS`。
- **浏览器（Playwright，页面聚焦，1280×720，高 / 低档）：** 拆除前（用备份的 `app.js` 路由到旧版本）/ 拆除后的**同机位**截图各一张：DR 广场西侧机位、办公室门口俯视、小地图；**拆除后西侧无仓库建筑**；成对 calls / 三角形（预期**下降**，列数据）；25 人上班路线 + 小橘走一圈无穿墙（T16b 200 种子仍全过）；控制台 0 错误；**主页面加载遮罩消失、无错误条**。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；**贴拆除前 / 后截图**。**不要自己重启服务。**
