# S2-6-campus-motion：叉车、卡车、传送带的确定性展示动画与低档降级（经注册口，不改 app.js，约 1–1.5 小时）

> **【2026-10-21 傍晚：改派 Trae（董事会批准 Trae 加入区域建设）】** 执行者改为 **Trae（新会话；仓配产线）**，其余要求不变：**不改 `app.js`**，只通过园区模块注册口（`dr-campus-modules.js`）接入；**仓配产线的配色 / 组件不得与办公区共用**。为便于不依赖主场景验证，额外交付一个**独立预览页 `dr-campus-motion-preview.html`**（自带最小 Three.js 场景：一块地面 + 几个月台 / 货架占位 + 本模块的叉车 / 卡车 / 传送带，深浅主题、可轨道旋转，显示 calls 与三角形读数），**页面只请求静态资源**；真正在 `?campus=1` 里的效果仍须在主场景里用「切换可见性取精确增量」验证（预算高档 ≤ +3 calls、低档 +0）。动画消费「园区事件源」接口（见下方追加段）。做完单独汇报并停下等验收。

**执行者：Codex（新会话）。小镇线 · 场景。** **不改 `app.js`**（经 S2-4 注册口；注册表需提供每帧回调，若 S2-4 未提供则在本卡**只在 `dr-campus-registry.js` 内**补 `onFrame(dt)` 接口，`app.js` 不动——若确实无法做到，停下汇报）。**前置：S2-5 已验收。** 先读：`_common.md`、`_lane-town.md`、`docs\dr-campus-plan.md` 第 4 节（动画与预算）、`dr-campus-registry.js`、`dr-campus-racks-spec.mjs`（走道、月台位）、`fun.js` / `cat-play.js` 里的动画与看门狗写法（只读参考）、`quality.js`（只读，动态根的约定）。

**允许修改：** 新增 `dr-campus-motion.js`、`dr-campus-motion-logic.mjs`（纯逻辑：路径、相位、时间片，Node 可测）、`tests\dr-campus-motion.test.mjs`；`dr-campus-modules.js`（只追加登记）、`dr-campus-registry.js`（仅在需要时补 `onFrame`，逐行列出）；README 一节。备份相关文件到 `office3d-backup-s2-6`。

> **【2026-10-21 夜追加】** 动画模块不要直接写死「时间 → 位置」，而是**消费一个抽象的「园区事件源」接口**（`CampusEventSource`：`subscribe(callback)` / `snapshot()`，事件如 `truck_arrive / truck_depart / forklift_move / conveyor_tick`，带 `id`（幂等）、`at`、`dockId`）；**默认实现是确定性演示源**（固定种子 + 注入时钟）。动画由**已确认的事件**驱动，**暂停 / 关闭动画不影响事件源本身**；页面上显示「演示数据 · 播放进度」。**不接任何真实数据，不请求网络。** 目的：将来可由经授权的快照驱动（见知识库第二十九节），现在只做接口与演示源。

## 要做的事
1. **纯逻辑（`dr-campus-motion-logic.mjs`）**：`forkliftPath(layout)`（沿高位货架走道的闭合折线 + 装卸点停顿）、`truckPlan(layout)`（收货月台 / 发货月台各位：静止卡车位；每时间片只有 1 辆做进出场滑动）、`conveyorLoop(layout)`（拣货 → 包装的传送带环路）、`phaseAt(timeMs, seed)`（**固定种子 + 注入的时间，无 `Date.now / Math.random`**；同输入同输出）。所有轨迹**封闭在各自展示通道内**，不进入人物碰撞与路线。
2. **绘制（`dr-campus-motion.js`）**：叉车 2 辆（高档循环、低档 1 辆静态）、卡车（高档 2 静 + 1 动、低档 2 静）、传送带 2 条（高档循环、低档静态）；**共享几何 / 材质，动态件归入单一动态根并标 `userData.dynamic`**；不新增光源。页面隐藏（`document.hidden`）时暂停；页面不可见 / 园区不在视锥内时**跳过更新**。
3. **看门狗与开关**：动画独立开关（URL `?campusMotion=0` 可关闭，默认开启；园区本身默认仍需 `?campus=1`）；任何动画异常只停用该动画；**零网络请求、零 token、不读 Paperclip、不读任何订单 / 库存数据**。
4. **预算：** 高档累计在 S2-5 基础上 **+3 calls、≤ 17k 三角形**；低档 **+0 call**（全部静态化）；园区开启、同机位同画质成对测量。

## 测试与验收
- 纯逻辑：路径闭合且位于走道内、与货架 / 月台 / 人物区无相交、相位确定性（两次相同）、时间片边界、同一月台位不会同时出现两辆车；静态检查（无 `Math.random / Date.now / fetch / innerHTML`）。
- 浏览器：`?campus=1`，录 ≥ 10 秒帧序列：叉车沿走道行驶不穿货架、卡车进出场不穿月台门、传送带循环；低档静态；`?campusMotion=0` 全静态；成对 calls；控制台 0 错误；页面隐藏后恢复无跳变；默认页面零变化。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致。**不要自己重启服务。**
