# A1-home-space-model：个人空间数据模型——目录、占用格、摆放校验、连通性（纯模块，约 1 小时）

**执行者：Trae（新会话）。小镇线 · 数据类。** 先读：`_common.md`、`_lane-town.md`、**`docs\home-space-spec.md`（唯一规格，数值以它为准）**。仿照 `town\town-engine.mjs` 的纯函数写法与 `tests\town-engine.test.mjs`。

**允许新增：** `town\home-catalog.mjs`、`town\home-space.mjs`、`tests\home-space.test.mjs`。**不要改任何已有文件**（`README.md` 末尾追加一节「个人空间数据模型（A1）」除外）。**不接任何路由、不碰 `app.js` / `server.mjs`、不读写任何文件**（纯函数）。备份不需要（不改已有文件）。

## 要做的事
1. **`home-catalog.mjs`**：导出冻结的 `CATALOG`（规格第 3 节的 12 种物品，字段齐全）、`ITEM_IDS`、`getItem(id)`（未知返回 `null`）、`CATEGORIES`、`LAYERS`。`id / name / category / footprint / height / layer / blocks / stackable` 与规格表逐项一致（测试逐条对照，不是抽样）。
2. **`home-space.mjs`（全部纯函数，不引用 `THREE / document / fetch / Math.random / Date.now / performance.now`，时间由参数传入）**：
   - 常量：`CELL_M = 0.5`、`GRID_W = 16`、`GRID_D = 12`、`MAX_PLACEMENTS = 60`、`DOOR = { cx0: 7, cx1: 8, cz: 11 }`、`ENTRY_CLEAR = { cx0: 6, cx1: 9, cz0: 10, cz1: 11 }`；`cellCenter(cx, cz)` → 局部米坐标 `{ x, z }`（`(cx + 0.5) * CELL_M`，原点西北角）。
   - `occupiedCells(item, cx, cz, rot)` → 占用格数组（`rot` 为 0 / 90 / 180 / 270，90 / 270 时 `w` 与 `d` 互换，以 `(cx,cz)` 为最西北格向东向南展开）；非法 `rot` 抛错或返回 `null`（二选一并写测试）。
   - `validateLayout(placements, inventory)` → `{ ok, violations: [{ rule, instanceId, detail }] }`，**实现规格 2 节的 7 条规则**：① 越界 ② `floor` 层重叠 ③ `rug` 规则 ④ `wall` 物品必须贴墙（旋转后北 / 南墙要求 `d'=1` 且 `cz=0` 或最后一格 `cz=11`；东 / 西墙要求 `w'=1` 且 `cx=0` 或最后一格 `cx=15`）且**不得占门洞格** ⑤ 入口净空区无 `blocks:true` ⑥ **连通性**：门前入口格到每件 `blocks:true` 物品**至少一个相邻空格**存在 4 连通路径（BFS，`blocks:true` 的占用格为障碍，`rug` 与 `wall_art` 不是障碍）⑦ 总数 ≤ 60；另加：`itemInstanceId` 必须存在于 `inventory`、**同一实例不得重复摆放**、`itemId` 必须在目录内。`violations` 里的 `rule` 用 1–7 与 `'inventory' | 'duplicate' | 'unknown_item' | 'bad_rot'` 标识，**每条违反都要给出具体 `instanceId` 与可读 `detail`（中文，≤ 40 字）**。
   - `canPlace(layout, inventory, candidate)` → `{ ok, violations }`（只判定「加入这一件后是否合法」，不修改）；`placeItem / moveItem / rotateItem / removeItem(layout, ...)` 返回**新的** layout（不可变），**不合法时返回 `{ ok:false, violations }` 且原 layout 不变**。
   - `starterInventory()` → 规格第 4 节的起始库存（每种 1 件，另加 `chair_wood` 共 3 件、`plant_pot` 共 2 件、`frame_art` 共 2 件；实例 id 形如 `bed_single#1`、`chair_wood#2`；`source:'starter'`；`acquiredAt` 由参数传入，不要读系统时间）。
   - `defaultLayout(ownerId)` → `{ schemaVersion:1, ownerId, revision:0, updatedAt:null, placements:[] }`；`normalizeLayout(raw)`（从不可信 JSON 恢复：丢弃未知字段、非法放置项**整项丢弃并计数**，返回 `{ layout, dropped }`，不抛异常）。
   - `layoutStats(layout)` → `{ count, byCategory, blockingCells, freeCells }`。
3. **只依赖自身与 `home-catalog.mjs`，不 import 任何业务模块。**

## 测试（`tests/home-space.test.mjs`）
- 目录：12 项与规格表逐项相等；冻结（尝试修改抛错或无效）；`getItem` 未知 → `null`。
- 占用格：四个旋转 × 非对称物品（`bed_single` 4×3）；越界边界（刚好贴边合法、超出 1 格非法）。
- **7 条规则各至少 3 个用例（合法边界 / 恰好违反 / 明显违反）**，尤其：`wall` 层四面墙各一例（含旋转后的东 / 西墙）、门洞格上的 `wall_art` 非法、入口净空区内放 `chair_wood` 非法但放 `rug_round` 合法、**把人封死**（用家具围出封闭区域让某物品不可达）被识别、`rug` 与 `floor` 重叠合法而 `rug` 与 `rug` 重叠非法、第 61 件非法。
- `place / move / rotate / remove`：不可变（原对象未变）、非法时返回违反项、重复摆放同一实例被拒、库存里没有的实例被拒。
- `starterInventory()`：数量与 id 精确；`defaultLayout`；`normalizeLayout` 对垃圾输入（`null`、数组、缺字段、超长字符串、负坐标、`rot=45`、重复实例）不抛异常且正确计数。
- **确定性与纯净**：相同输入两次调用输出深度相等；**静态检查**：两个源文件不含 `THREE / document / window / fetch / Math.random / Date.now / performance.now / innerHTML / eval`，也不含 `buy / purchase / price / balance / wallet`。
- 全量 `node --test tests/*.test.mjs` 全过，**不得放宽已有断言**。

## 验收与汇报
`node --check` 两个源文件；全量测试全过；汇报「做到 / 没做到 / 未验证」，列出新增文件与行数；**汇报必须与磁盘一致**。**不要自己重启服务。**
