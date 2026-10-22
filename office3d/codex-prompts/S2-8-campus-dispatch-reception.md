# S2-8-campus-dispatch-reception：调度中控「模拟」屏、接待区与展示区细节（经注册口，不改 app.js，约 1–1.5 小时）

**执行者：Codex（新会话）。小镇线 · 场景。** **不改 `app.js`**（经 S2-4 注册口）。**前置：S2-4 已验收（可与 S2-5 / S2-6 并行）。** 先读：`_common.md`、`_lane-town.md`、`docs\dr-campus-plan.md`（`dispatch / visitor / showcase / officeMeeting / maintenance` 分区）、概念图（调度中控大屏：区域地图 + 柱状图 + 值班席；接待区沙发与前台；展示区品牌墙与展台；办公与会议区办公桌；设备与维护区叉车充电位）、`dr-campus-registry.js`。

**允许修改：** 新增 `dr-campus-interior.js`、`dr-campus-screen.mjs`（纯逻辑：屏幕画面描述与数据，Node 可测）、`tests\dr-campus-interior.test.mjs`；`dr-campus-modules.js`（只追加登记）；README 一节。备份 `dr-campus-modules.js` 到 `office3d-backup-s2-8`。**不要改** `app.js`、`server.mjs`、`office-layout.js`、`town\`。

## 要做的事
1. **调度中控屏（只显示模拟数据）**：`dispatch` 区的大屏 + 值班席。屏幕内容由 `dr-campus-screen.mjs` **用固定种子生成**的「模拟调度画面」（示意地图轮廓、若干「模拟」节点与连线、柱状图、状态灯），Canvas ≤ **1024×512**，**低频重绘（≤ 1 次 / 5 秒，仅内容变更时）**，**屏幕上必须有清晰的「模拟数据 · 示意」水印**；**不读 Paperclip、不读任何订单 / 库存 / 车辆真实数据、零网络请求、零 token**。页面隐藏或屏幕不在视锥内时不重绘。
2. **接待区与展示区（只做参观外观）**：`visitor`（接待台、沙发、绿植）、`showcase`（品牌墙「DR 仓配服务中心（示意）」、展台、屏幕上只放静态示意文案与「示意 / 模拟」标识）、`officeMeeting`（办公桌与会议桌，非真实办公入口）、`maintenance`（叉车充电位静态道具）。**不放人物，不开放任何交互（点击只能聚焦，不打开业务页面）**；不出现真实商户 / 客户 / 地址 / 面积 / 订单；预留「授权标签」文案位（本期显示「示意」）。
3. **预算：** 高档 ≤ **+1 call**（屏幕 +1，其余家具合并 / 实例化到既有批次或 ≤ +1）、≤ 8k 三角形；低档屏幕静态；不新增光源（屏幕用自发光材质）。

## 测试与验收
- 纯逻辑：`screenFrame(seed, timeSlice)` 确定性；输出不含任何外部数据字段；水印字段存在；重绘频率上限；静态检查（无 `fetch / Math.random / Date.now / innerHTML`，无 `buy / price / balance / wallet`，无真实商户名 / 地址）。
- 浏览器：`?campus=1` 调度屏近景、接待区近景、展示区近景（深浅主题）；成对 calls；5 秒帧序列无闪烁；控制台 0 错误；**网络面板确认屏幕不产生任何请求**；默认页面零变化。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致。**不要自己重启服务。**
