# A2-home-store：个人空间布置存储——原子写、乐观锁、损坏保护、安全路径（独立模块，不接路由，约 1 小时）

**执行者：Trae（新会话）。小镇线 · 数据类。** **前置：A1 已验收**（`town\home-catalog.mjs`、`town\home-space.mjs`）；缺失先停下汇报。先读：`_common.md`、`_lane-town.md`、**`docs\home-space-spec.md` 第 4–6 节**、`town\home-space.mjs`（`validateLayout / normalizeLayout / defaultLayout / starterInventory`）、`tenancy\tenant-path.mjs`（或同类安全路径函数，**只读参考**其目录穿越 / 联接点防护写法）、`tests\town-engine.test.mjs` 与 `town\` 现有存储的原子写写法。

**允许新增：** `town\home-store.mjs`、`tests\home-store.test.mjs`；`README.md` 末尾追加一节「个人空间存储（A2）」。**不要改**任何已有文件；**不接路由、不碰 `server.mjs` / `app.js`**（A3 才接）；不对 Paperclip 发请求。备份目录：`office3d-backup-a2`（只备份将改的 `README.md`）。

## 要做的事
1. **`createHomeStore({ dir, now })`**（`dir` 为数据根目录，测试用临时目录；`now` 是时钟函数，由调用方传入，**模块内不直接调用 `Date.now`**）→ 对象：
   - `homePath(ownerId)`：**唯一**路径入口。`ownerId` 必须匹配 `^[a-z0-9_-]{1,40}$`；结果必须落在 `<dir>\home\` 之内；对 `..`、绝对路径、盘符、冒号、反斜杠、空字节、保留设备名（`con/nul/aux…`）、尾随点 / 空格、超长、大小写混淆、联接点 / 符号链接逃逸**一律拒绝**（抛带 `code` 的错误，不回显原始输入）。
   - `load(ownerId)` → `{ layout, inventory, status }`：文件不存在 → `defaultLayout` + `starterInventory(now())`，`status:'new'`（**不落盘**）；存在且合法 → 经 `normalizeLayout` 恢复，`status:'ok'`，同时返回被丢弃的项数；**损坏**（JSON 解析失败 / 结构不对）→ 返回默认布置 + `status:'corrupt'`，并把原文件**复制**为 `<ownerId>.corrupt-<时间戳>.json`（时间戳来自 `now()`；同名则加序号；**最多保留 5 份**，超出删最旧的），**不覆盖原文件**。
   - `save(ownerId, { placements, expectedRevision })` → `{ ok, layout }` 或 `{ ok:false, code }`：先 `validateLayout`（对该用户库存）；`expectedRevision` 与当前不符 → `code:'revision_conflict'` 并返回当前布置；`placements` 数超过 `MAX_PLACEMENTS` → `code:'too_many'`；成功则 `revision + 1`、`updatedAt = now()`，**原子写**（同目录临时文件 → `rename`；失败不留半截文件）。**同一 `ownerId` 的并发 `save` 串行化**（进程内队列 / 锁），两个并发 `save` 同一 `expectedRevision` 只有一个成功。
   - `reset(ownerId, { expectedRevision })`：清空 `placements`，库存不变，写新 `revision`（规格「恢复默认」）。
   - `inventory(ownerId)`：返回库存（v1 只有 `starter`）；库存文件与布置文件**分开**（`<ownerId>.inventory.json`），首次 `load` 不创建，首次需要时才落盘。
   - 大小限制：单个布置文件读取上限 **64 KB**，超过视为损坏；写入前序列化体积也受此上限。
2. **不涉及 DR 币与账本**；不出现 `buy / purchase / price / balance / wallet` 命名；不读取环境变量与密钥。
3. **磁盘卫生**：目录不存在时自动创建；崩溃遗留的 `*.tmp` 在 `load` 时忽略且不被当作数据（可顺带清理 >1 小时的旧临时文件，用 `now()` 判断）。

## 测试（`tests/home-store.test.mjs`，全部用临时目录）
- 路径：合法 id 通过；上述每一类恶意输入至少一例被拒；构造一个指向目录外的联接点 / 符号链接（无权限创建则跳过并在汇报说明），写入被拒。
- `load`：新用户默认 + 起始库存且**不落盘**；正常文件往返；损坏文件 → 默认 + 副本，原文件字节不变；副本超过 5 份只留最新 5；超过 64 KB 视为损坏；含非法放置项的文件 → 丢弃并计数。
- `save`：成功递增 `revision`；`expectedRevision` 过期 → 冲突；非法布置（重叠 / 越界 / 封死）→ 拒绝且磁盘不变；**并发两次同 `expectedRevision` 只有一次成功**；写入中途失败（注入一个让 `rename` 抛错的实现）→ 旧文件完好、无残留临时文件。
- `reset`：清空放置、库存不变、`revision` 递增。
- 纯净度：源文件不含 `Date.now / Math.random / fetch / child_process / eval / innerHTML / process.env`；不含 `buy / purchase / price / balance / wallet`。
- 全量 `node --test tests/*.test.mjs` 全过，不得放宽已有断言。

## 验收与汇报
`node --check town\home-store.mjs`；全量测试全过；汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出新增文件与行数、测试数；说明联接点测试是否实际执行。**不要自己重启服务。**
