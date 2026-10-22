# 个人空间规格（home-space-spec v1）——数据模型、3D 场景、UI 共用的唯一规格

> 董事会 2026-10-21 决定：DR 仓库 = 物品库存；玩法闭环 = **安家与布置**。本文件是 A 系列任务（`A1 / A2 / A3 / A4 / A5 / A6 / A7`）的**共同规格**，数值以本文为准；需要改动时**只允许董事会侧修改本文件**，执行者发现不合理要在汇报里提出，不要自行改数字。

## 1. 空间与网格
- **格子（cell）= 0.5 米**；个人空间内部 **16 × 12 格 = 8 × 6 米**；坐标 `(cx, cz)`，`cx = 0…15`（东西，向东增大），`cz = 0…11`（南北，向南增大）；原点在**西北角**。
- 墙高 3.0 米；**门在南墙正中**：占 `cx = 7…8`、`cz = 11` 的外侧入口格；**门前 2 格（`cz = 10…11`、`cx = 6…9`）为「入口净空区」，不得摆放阻挡类物品**（保证能走进来）。
- 地面 `y = 0`；个人空间是**一个独立的小房间模板**，不与办公室几何重叠（由 A4 决定它在场景里的放置位置，数据模型不关心世界坐标）。

## 2. 物品（item）与摆放（placement）
- 物品由**目录（catalog）**定义，字段：`id`（`^[a-z0-9_]{3,32}$`）、`name`（中文，≤ 12 字）、`category`（`furniture | decor | plant | light | wall_art | rug`）、`footprint: { w, d }`（占用格数，宽 = 东西向，深 = 南北向，**旋转 0° 时**）、`height`（米）、`layer`（`floor | wall | rug`）、`blocks`（是否阻挡通行，`rug` 恒为 `false`）、`stackable`（是否可放在其它物品上，v1 恒为 `false`）。
- **摆放记录**：`{ itemInstanceId, itemId, cx, cz, rot, layer }`，`rot ∈ {0, 90, 180, 270}`；`itemInstanceId` 是该用户库存里**一件具体物品**的唯一 id（同一 `itemId` 可有多件）。
- **占用格**：由 `footprint` 与 `rot` 计算（90° / 270° 时 `w` 与 `d` 互换），以 `(cx, cz)` 为**最西北格**向东、向南展开。
- **规则（校验函数必须全部实现）**：① 全部占用格在 `0…15 × 0…11` 内；② `layer: floor` 的物品之间**占用格不得重叠**；③ `layer: rug` 可与 `floor` 物品重叠，`rug` 之间不得重叠；④ `layer: wall` 的物品必须**紧贴北 / 东 / 西 / 南墙之一**（其 `footprint.d = 1`，且最外侧格在边界行 / 列上），且**不得在门洞格上**；⑤ **入口净空区无 `blocks: true` 的物品**；⑥ **从门到每一件 `blocks: true` 物品相邻的某个空格，必须存在 4 连通路径**（不得把人封死）——校验函数需返回具体违反哪一条；⑦ 总摆放数 ≤ **60**。

## 3. 起始物品目录（v1，12 种；A1 实现为数据，A7 做 3D 模型）
| id | 名称 | category | footprint(w×d) | height | layer | blocks |
|---|---|---|---|---|---|---|
| `bed_single` | 单人床 | furniture | 4 × 3 | 0.6 | floor | 是 |
| `sofa_two` | 双人沙发 | furniture | 4 × 2 | 0.8 | floor | 是 |
| `table_dining` | 餐桌 | furniture | 3 × 2 | 0.75 | floor | 是 |
| `chair_wood` | 木椅 | furniture | 1 × 1 | 0.9 | floor | 是 |
| `desk_work` | 书桌 | furniture | 3 × 2 | 0.75 | floor | 是 |
| `wardrobe` | 衣柜 | furniture | 2 × 1 | 2.0 | floor | 是 |
| `bookshelf` | 书架 | furniture | 3 × 1 | 1.8 | wall | 是 |
| `tv_stand` | 电视柜 | furniture | 3 × 1 | 0.5 | wall | 是 |
| `plant_pot` | 盆栽 | plant | 1 × 1 | 1.0 | floor | 是 |
| `lamp_floor` | 落地灯 | light | 1 × 1 | 1.6 | floor | 是 |
| `rug_round` | 圆形地毯 | rug | 4 × 4 | 0.02 | rug | 否 |
| `frame_art` | 挂画 | wall_art | 2 × 1 | 1.0 | wall | 否 |
> 说明：`wall_art` 的 `blocks=false`（不占地面通行）；`bookshelf / tv_stand` 为 `layer: wall` 且 `blocks: true`（贴墙的落地家具）。

## 4. 库存（inventory）
- 库存 = 用户拥有的物品实例列表 `{ itemInstanceId, itemId, acquiredAt, source }`；`source ∈ { 'starter', 'grant', 'purchase' }`——**v1 只有 `starter`（初始赠送）**：新用户获得**每种物品各 1 件，另加 `chair_wood` 3 件、`plant_pot` 2 件、`frame_art` 2 件**；**不涉及 DR 币，不扣不加任何数值**。
- **摆放中的物品仍在库存里**（库存是「拥有」，摆放是「使用」）；一件物品同一时刻只能摆放一次。

## 5. 持久化与版本
- 布置文档：`{ schemaVersion: 1, ownerId, revision, updatedAt, placements: [...] }`；`revision` 单调递增，写入时带 `expectedRevision` 做乐观锁。
- **「恢复默认」**= 清空 `placements`（库存不变）并写一次新 `revision`；**撤销**是客户端 / 会话内的操作栈，**不写入持久化**（v1 撤销栈上限 50 步）。
- 所有写入**原子（临时文件 + rename）**；损坏文件视为「无布置」并保留原文件副本，不覆盖。

## 6. 隔离与开关（所有 A 系列任务共同遵守）
- 总开关 `town-home.json`：`{ "enabled": false }`；**缺失 / 损坏 / 非布尔 `true` 一律关闭**；关闭时**所有相关路由与页面与改动前逐字节一致**（用 `tools\tenancy-snapshot.mjs` 验证）。
- **零 token**：不调模型、不发评论、不建任务、不写 Paperclip；**不涉及 DR 币与账本**。
- 布置数据只存 `town\data\home\<ownerId>.json`（`ownerId` 只允许 `^[a-z0-9_-]{1,40}$`，路径只能经安全解析函数得到）；**不得出现在 `/state`、不得进入工作知识库或同事上下文**。
- 页面文案不得出现「购买 / 价格 / 余额」（v1 无交易）。
