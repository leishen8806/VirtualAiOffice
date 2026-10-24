# S2-16：园区调度屏改用同一份模拟快照（Trae，仓配线；小卡，约 1 小时）

**来源：** 外部评审第三节 + 规划者核实。**现状：** 中控室大屏（S2-14，`dr-control-room-screen.js`）已用 `demoSnapshotAt(CONTROL_ROOM_BASE_SNAPSHOT, elapsedMs)`，与二维调度台（`dr-console.js`）同源；但**园区内的调度屏**（S2-11，`dr-campus-interior.js`）仍用自己的 `screenFrame(2808, slice)` 独立生成数字、约 5 秒刷新一次。结果：三块屏都会动，但同一时刻说的不是同一件事。

## 要做的事
1. 园区调度屏的数字（KPI、运单摘要、最近事件）改为消费**同一个模拟快照与同一个演示时钟**（`demoSnapshotAt` 及其基础快照；若基础快照目前在 `dr-control-room-screen.js` 里，抽到一个**无 DOM 依赖**的共享模块，二维、中控、园区屏三处共用；**不新增第三套事件生成器**）。保留 S2-11 已验收的柬埔寨地图绘制（`dr-cambodia-outline`）与标签规则，只换数据来源。
2. **一致性测试：** 同一 `elapsedMs` 下，三处（二维 / 中控大屏 / 园区屏）的 KPI、运单进度、最近事件序列逐项相同；停止 / 重置后三处回到同一份静态快照；`elapsedMs` 为 0、负数、极大值、`NaN` 不产生 `NaN / undefined`。
3. **开关与生命周期：** 沿用现有默认关闭；开关关闭时园区屏**不创建定时器、不初始化动画**（保留静态摘要）；页面隐藏 / 场景退出 / `dispose` 后无残留定时器（假时钟测试）；`dispose` 只释放本模块创建的纹理与材质，不销毁共享资源。动画按演示时钟推进，**不得因渲染帧率不同而变速**。
4. 不改 `server.mjs`、不新增网络请求、不新增轮询；全量 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/*.test.mjs` 全过；控制台 0 错误。
5. **真实浏览器验收（用完即删截图）：** 同一页面同时看到园区屏与中控大屏（`?place=drlife-warehouse&controlRoom=1&controlRoomLive=1`），在 0 / 5 / 15 秒各读一次两边数字并贴出，证明一致。

备份到 `office3d-backup-s2-16`；不读取或打印密钥，不重启服务。「做到 / 没做到 / 未验证」，汇报后**直接做下一张（S2-17）**。
