# O6O7-register-bar-and-display：把吧台（O6）、展示部门家具与展示人物（O7）接入办公区 v2 注册口（约 1–1.5 小时）

**执行者：Codex（会话一；排在 O5 验收之后、O8 之前）。办公区产线。** **前置：O4b 已通过；O5 已通过；Trae 的 O6、O7 已通过验收。** 目标：让董事会在 `?layout=2` 里看到吧台、四个展示部门，在 `?layout=2&display=1` 里再看到 12 个模拟角色。**不新增业务逻辑，只做「登记 + 接线 + 联调验证」。**

先读：`_common.md`、`_lane-town.md`、`office-v2-modules.js`、`office-v2-registry.js`、Trae 交付的 `office-bar.js`、`office-bar-geometry.js`（`.mjs` 为转发）、`display-departments.js`、`display-staff.js`、`display-staff-logic.js`、`display-staff-mesh.js`、`display-staff-preview.js`（只读，看它们如何被调用）、O5 卡与你自己 O5 的路径实现、`docs\office-redesign-plan.md`。**这些 Trae 文件不要改写；发现问题记录在汇报里，需要改时停下告诉我，由我派回 Trae。** 开工前备份 `office-v2-modules.js`、`office-v2-registry.js`、`app.js`（若要动）到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-o6o7`（上一级目录）。

## 要做的事
1. **登记三个模块**（`office-v2-modules.js` 里把 O4b 预留的注释行换成真实登记，各自 `try/catch` 隔离，沿用 `office2-<模块>-<部件>` 命名）：
   - `bar` → `buildOfficeBar({ THREE, root, layout, materials, collision, canvasTex, low })`；
   - `displayDepartments` → `buildDisplayDepartments({ THREE, root, layout, low, canvasTex })`（四个展示部门的静态家具与地面标注，随 `layout=2` 出现）；
   - `displayStaff` → `buildDisplayStaff({ THREE, root, layout, config, search, now, low, canvasTex })`（**只有 `?display=1` 时才创建人物**；不带参数时模块可以登记但不得创建任何网格、不得耗 calls）。
   - **全部挂在 `office2-root` 之下**，隐藏根即整体隐藏；任一模块抛错只跳过该模块，其余保留（用假工厂写一条测试）。
2. **配置与开关**：浏览器读不到 `.json`（静态白名单），本卡**不新增服务端路由、不改 `server.mjs`**。展示人物仅由 URL `?display=1` 开启（`displayConfig` 已支持）；`display-staff.json` 继续默认关闭、本卡**不读它**，是否由服务端下发是后续决策，汇报里提一句即可。
3. **每帧更新**：`display-staff` 需要逐帧 `update()`。注册表目前没有每帧回调：**在 `office-v2-registry.js` 内补 `onFrame(dt)` 接口**（参考 `dr-campus-registry.js` 的写法，只读参考、**不 import 它**；每个模块独立 `try/catch`，出错只停用该模块；页面隐藏 / 视锥外跳过更新；`dispose` 时还原钩子）。时钟：展示人物使用**与 25 位同事上下班一致的金边办公时钟**（`now` 注入），不使用 `Date.now` 直读；若为取得该时钟必须改 `app.js`，**净增 ≤3 行并逐行列出**。
4. **碰撞与路线的单一来源**：吧台的 12 段碰撞若在 O2 / O5 的布局数据里已有，**不得重复注册成两份**；请确认 Trae 的 `barColliders(layout)` 与布局数据的吧台碰撞一致（坐标与段数逐条对照），选定唯一注册方，并在汇报里写明。展示人物是**纯展示、无碰撞**，但他们与真人 25 位在通行环上同走：用 T16b 的 200 种子在 `layout=2&display=1` 下各跑一遍，**统计真人与展示人物的最小间距并汇报**；若出现 <0.52 m 的重叠，**如实写出次数与位置，不要偷偷改参数**（由我裁定调度还是路线）。
5. **隔离**：展示人物**不得进入** `/state`、`/world`、同事搜索、在岗人数（25 在岗不变）、任务 / 审批 / 治理中心任何数据、人物点击详情；他们的标牌显示「展示部门 · 模拟角色」。验证方法：同一页面对比 `?layout=2` 与 `?layout=2&display=1` 的 `/state` 响应与搜索结果，逐字段一致。零 token、零网络、不读 Paperclip。
6. **画质**：低档隐藏展示人物、吧台用 Trae 的低档简化版；高档按其预算。
7. **预算与回归（同机位同画质成对测量，切换对应根的可见性取精确增量）：** 吧台高档 ≤ +3 calls、低档 +1；展示部门家具读数单列（预期随静态合并近似 0 增量，如不是请说明）；展示人物高档 ≤ +2 calls、低档 +0；**layout=2 累计读数 = O5 验收数字 + 上述增量**（汇报里列对照表）。**默认页面（不带 `layout=2`）逐数据不变**，路由快照零新增请求。
8. **测试**：模块登记清单与顺序；缺某个模块 / 模块抛错时其它模块照常；`?display=1` 与不带参数的创建差异；根可见性开关；`onFrame` 隔离；静态检查（本卡新增代码无 `dr-campus` / `dr-console` 引用、无 `fetch / innerHTML / Math.random / Date.now`、无深蓝科技色字面量）。**全量 `node --test` 全过，不得放宽任何已有断言。**

## 浏览器验收（必做，Playwright，页面聚焦，1280×720，高 / 低档）
- `?layout=2`：吧台与四个展示部门出现，加载遮罩消失、无错误条、控制台 0 错误；截图（办公区俯视、吧台近景、展示部门近景）；25 人上班路线 + 小橘走一圈无穿墙。
- `?layout=2&display=1`：12 个模拟角色按计划往返吧台，同时行走 ≤2；暂停 / 页面隐藏后恢复无跳变；`/state` 不变。
- 低档：展示人物不出现，吧台简化版；
- 故意让 `displayStaff` 抛错：吧台与家具仍正常，控制台有一条跳过提示、无报错页面。

## 汇报
「做到 / 没做到 / 未验证」，与磁盘一致；贴 `app.js` 接线行（如有）、`office-v2-registry.js` 的 `onFrame` 改动行、碰撞一致性对照、T16b 真人与展示人物最小间距统计、精确增量对照表、截图路径。**不要自己重启服务。** 做完停下等我验收。
