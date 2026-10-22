# 新布局休息区动作检查（2026-10-19，金边）

结论：不通过。本轮检查，不修改行走、避让或起坐的产品逻辑。

## 方法与范围

- 先备份到 `E:/VirtualAIOffice/paperclip-ops/office3d-backup-lounge-actions-20261019-121336`。
- 使用正在运行的 `http://office.localhost:3200/`；未启动、停止、重启任何服务，未发送业务写请求或 Telegram。
- 先查看现场六人坐姿，再以当前人物的相同骨骼、蒙皮、动画片段和 `solve()` 创建隔离模型副本；使用真实场景与当前 director，不用简化骨架代替模型。
- `tests/browser-lounge-actions.js` 在页面内推进 1/60 秒步长，记录关键阶段、骨骼世界坐标与人物中心距离；只渲染/截图选取的关键帧。
- 页面上明确显示“本地动作验收（非业务事件）”。运行时临时移走原人物的渲染节点，结束后恢复；不改角色真实状态或事件队列。
- `people.js` 仅增加 `avatar` 和 `cloneForTest()` 诊断接口，没有更改模型或动作逻辑。

## 已确认结果

| 检查 | 结果 | 依据与边界 |
|---|---|---|
| 25个人物配置、22种模型分别去休息区并返回 | 25/25完成 | 每人一个指定座位，不代表每个模型×每个座位×所有随机动作组合 |
| 起身、行走、坐下阶段推进 | 25/25经历全部阶段 | 真实播放器逐帧运行；不等于所有渲染帧都经人工查看 |
| 入座前转身 | 25/25在进入sit阶段时仍差约180° | director.js 同时降低坐姿和插值旋转；缺少先转正再坐下的独立阶段 |
| 六人同向出发与返回 | 都能完成，但有重叠 | 中心最小距离约0.365米，小于当前胶囊直径0.44米；180个“人物对×采样帧”重叠事件 |
| 三人离开、三人进入，双向交汇 | 都能完成，但明显穿模 | 2.017模拟秒首次低于0.44米，最小中心距接近0；189个人物对×帧重叠事件；截图可见两个人体交叉 |
| 本次场景是否持续堵死 | 未复现 | 双向场景推进到122.017模拟秒时active=0；不是任意人数/低帧率/门口组合无堵塞的证明 |
| 六人现场静态坐姿 | 已抽查 | 截图未见明显腿穿茶几；袖口、宽袍、扶手接触没有逐顶点碰撞验证 |

计数中的 overlapFrames 是人物对×模拟帧，不是唯一画面帧数，不能直接换算为重叠持续秒数。

## 原因与最小后续修复方向

1. 人物之间没有动态避让；MAX_WALKERS=3仅限制事件队列，休息区直接走travel，不受该限制。优先让休息区出行统一参与通行限额，再处理狭窄通道占用、双向让行及防死锁。
2. 当前坐下同时旋转与降低姿态；应拆开“接近/转正/后退落座”，离座先完成起身和离开座椅，再转向主通道。
3. 起身和坐下使用站/坐循环交叉淡入，而非完整起坐动画；衣摆、手臂、扶手接触仍需在过渡修复后专项复验。

## 证据

- 完整测量：`E:/VirtualAIOffice/review-artifacts/lounge-actions-inspection-20261019.json`。
- 现场坐姿：`lounge-actions-live-before.png`。
- 起身关键帧：`lounge-actions-rise-mid.png`、`lounge-actions-rise-sofa-before.png`。
- 转身坐下关键帧：`lounge-actions-sit-turn-before.png`。
- 清晰的人体交叉：`lounge-actions-mixed-penetration.png`。
- 截图均位于 `E:/VirtualAIOffice/review-artifacts/`。

## 本地检查

```text
node --test tests/office-layout.test.mjs tests/motion-physics.test.mjs
tests 9 / pass 9 / fail 0
cmd /c "node --input-type=module --check < people.js"
cmd /c "node --input-type=module --check < tests/browser-lounge-actions.js"
```

这9项已有回归测试不覆盖动态人物避让，不能用其通过来否定本次复现的穿模。

## 未验证

- 全部真实时长连续播放画面逐帧人工审查、所有镜头角度。
- 所有随机动作种子、所有模型与座位组合、所有多人同时到达顺序。
- 10Hz等低帧率下的新多人模型场景、手机实机性能。
- 衣料自碰撞、手臂/衣摆/身体与家具的完整网格碰撞。

本轮没有修复这些产品缺陷；下一轮应先修复再复跑本记录中的失败场景。
