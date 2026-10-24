---
id: V3-A3
base: feat/v3-align-scene @ befaa45020dc83a35ae4b82413ceed3846e90be4（另合入 feat/v3-align @ fb1e899）
branch: feat/v3-align-routes（新建）
scope:
  - office3d/office-layout.js（只改导航函数与 LAYOUT_V3_ALIGN 的路线 / 出入线字段，不改区域、工位、门洞）
  - office3d/office-v3-public-path.js
  - office3d/office-v3-modules.js（只改 displayDepartments / displayStaff 两处 ALIGN 挂起）
  - office3d/display-departments.js
  - office3d/display-staff.js
  - office3d/display-staff-logic.js
  - office3d/tests/office-v3-align-routes.test.mjs（新增）
  - office3d/tests/office-v3-align-data.test.mjs
  - office3d/docs/v3-align-routes.md（新增）
  - dispatch/trae/outbox/V3-A3-report.md
budget: 6h
---
# V3-A3：格局对齐第 3 步——新格局下的真人路线、展示部门与展示人员

第 1 步（数据，Trae）与第 2 步（场景，Codex `c44047d` + OF-R3 `befaa45`）都已通过 Q-V1 复审。现在 `?layout=3&align=1` 能显示新格局：只有 7 间有墙房间，开放区无墙，中央是直径 12 m 的吧台岛加 4 m 环形通道，开放区有 31 件陈设并已登记碰撞。本卡让**人能在新格局里正确走动**，并把四角展示室接起来。

## 分支

1. 从 `feat/v3-align-scene` @ `befaa45` 新建 `feat/v3-align-routes`。
2. 先 merge `feat/v3-align` @ `fb1e899`（沙发 5.45，已通过）。
3. Codex 正在 `feat/v3-align-scene` 上做 V3-A2-R1（运维屏 / 书架位置），只改 `office-furniture-v2.js` 与场景测试。**本卡不要改这两个文件**。V3-A2-R1 通过后，派发人会告诉你通过版本，再 merge 进来。
4. 只追加提交；不 force push、不推 `main`。

## 硬约束：稳定 V3 不变

不带 `align=1` 的 `?layout=3` 下，导航输出、展示部门与展示人员必须与 `befaa45` **逐字节相同**：

- FIX3 `office-v3-meeting-navigation` 全部通过（含 R-03 的 1,375 条路线矩阵）；
- 另外把稳定 V3 的完整路线矩阵输出做哈希比对，与 `befaa45` 相同。

新逻辑只在 `layout.variant === 'align'` 时生效。

## 要做

### 1. 新格局的障碍物

ALIGN 下，路线必须避开以下障碍：

- 有墙房间的墙（`walled === true` 的 7 间，只能从门洞进出）；
- 吧台岛碰撞（`barColliders(layout)`，ALIGN 为 64 段、外沿 6 m）；
- 前台 / 服务吧 / 等候弧；
- 25 个工位桌；
- 第 2 步登记的陈设障碍物，即注册表 `get('zones').obstacles()` 返回的 31 项。

路线规划是纯数据函数，拿不到注册表。请让第 2 步的陈设规划可以在纯数据层重现：`office-vis2/align-zones.js` 已有规划，可导出一个不依赖 THREE 的函数，返回与 `obstacles()` 相同的盒子；导出时只能新增，不得改变已有输出。测试中断言两者一致。

### 2. 真人路线（`createOfficeV3Navigation` 的 ALIGN 分支）

- 开放区工位（west-open、kb、product、eng、drlife）没有门，从工位直接进入公共通行区；有墙房间只能从门进出。
- 25 个工位到以下目的地都要有路线：
  - 出口；
  - 其他工位；
  - 14 个会议席（A 8、B 6）；
  - board（老板站位）；
  - 吧台吧凳与沙发（沙发 5.45）；
  - 前厅 / 广场 / 消费者队列。
- `meetingAccess` 等字段如路线需要就重新取值。注意 `eastSpineX = 22.25` 离 D.life 的 DBEngineer、Localizer 工位（x = 22）只有 0.25 m，用作纵向通道时必须改。

### 3. 路线矩阵测试（新增 `tests/office-v3-align-routes.test.mjs`）

仿照 FIX3 R-03，枚举上述全部组合并报告总条数。每条路线必须满足：

- 坐标全部有限，非空；
- 不穿过有墙房间的墙，进出有墙房间必须经过其门洞；
- 线段与上面第 1 项的全部障碍物不相交，人物半径按 0.25 m 留出；
- 不进入吧台岛碰撞圈 `r < 6`；到吧凳 / 沙发的最后一段除外，但须从东西开口或环带一侧接近；
- 从开放区出发的路线不绕行：开放区内两点之间的路线长度 ≤ 直线距离 × 1.5。

### 4. 展示部门与展示人员（去掉第 2 步的挂起）

- 去掉 `office-v3-modules.js` 中两处 ALIGN `pendingModule`。
- `display-departments`：牌匾放在门所在的墙内侧，朝门。ALIGN 的门向为 market 东、service 西、aftersales 东、marketing 北，现有逻辑只按 `door.side === 'south'` 二分。
- `display-staff`：展示人员只在本房间内活动，并可到门外 1.5 m 内；不进入走廊以外的开放区；不穿墙、不穿陈设。
- `displayLayout()` 中把 `westNorthCross` / `eastSouthCross` 当作 north / south 走道的适配，在 ALIGN 下改为按各房间的门向取门外通道。

### 5. 取证

- 浏览器：只读静态服务；`/state` 使用**构造的假数据夹具**（25 个角色坐在各自工位，不含任何真实运营数据），外部请求与非 GET 一律拦截。
- 截图：
  - ALIGN 总览；
  - 西开放区；
  - 四角展示室（看得到牌匾与展示人员）；
  - 吧台岛（有人坐吧凳与沙发）。
- 若方便，导出 3 条代表路线的俯视叠加图：开放区工位 → 会议室 B、产品区工位 → 沙发、D.life 工位 → 广场。

## 不做

- 不改区域、门洞、工位坐标与绑定（如果确实需要改，停下报告）；
- 不改 `office-furniture-v2.js`、外壳、样板、陈设外观（Codex 负责）；
- 不改 `app.js`；
- 不推 `main`、不 force push、不部署、不启停服务；
- 报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后**务必把完整 SHA 告诉派发人**。
- 回执 `dispatch/trae/outbox/V3-A3-report.md` 写明：
  - 做到 / 没做到 / 未验证；
  - 路线矩阵总条数与全部断言结果；
  - 稳定 V3 路线哈希一致的证明；
  - 截图；
  - 测试真实输出末尾。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs`。失败按名称与 `befaa45` 比较，不得新增。
- 完成后停下，等待 Q-V1 复审。
