# 人物避让、休息区让行与转正落座修复

日期：2026-10-19（金边）；接续 `lounge-actions-inspection-2026-10-19.md`，保留此前失败记录。

## 备份和修改范围

备份：`E:/VirtualAIOffice/paperclip-ops/office3d-backup-pedestrian-yield-20261019-122444`。

- 新增 `pedestrian-traffic.js`：中心0.52米净距、沿移动段的扫掠检查、右侧绕行；候选步仍由已有家具碰撞检查。
- 修改 `director.js`：travel 等候阶段，与事件共用3人上限；休息区通道独占，离开前廊后或落座完成后释放；已等候出行优先于新事件申请行动位。
- 修改 `app.js`：人物状态显示“等候通行”“转正”。
- 修改 `tests/browser-lounge-actions.js`：按0.52米阈值计重叠，分别记录返回/双向场景、最大行动和等候人数、落座朝向误差、转正时降低坐姿的帧数。
- 新增 `tests/pedestrian-traffic.test.mjs`；更新 `docs/DESIGN.md`。
- 未改服务、鉴权、任务状态、额度、通知和后台流程，未安装依赖。

## 修复行为

1. 人物不再只检查桌椅：每一步先检查周围人物，防止一帧跨过他人；有空间时向右绕行，候选位置有家具或他人时保持等待。
2. 休息区窄道按请求顺序使用，等候者保留原坐姿，不把等候队列挤到门口。离开休息区前廊后可放行后人，所以返回过程仍可有最多3人同时行动。
3. 入座新增独立 turn 阶段：sit 保持0，行走混合逐渐停止，朝向差小于0.01弧度并完成站立过渡后才进入 sit。落座期间不再旋转。
4. 这是保守调度：前往休息区的人在工位等待通道许可，六人一起发起去程会比此前耗时更长；不使用瞬移或强行穿过去消除等待。

## 真实模型复验

沿用现有页面、真实场景家具和人物模型工厂，创建 PM、L、Helix、F2、Arc、B2 的隔离骨骼/蒙皮副本；使用同一 director 和 solve，不是此前简化骨架的路线副本。
页面明确标注“本地动作验收（非业务事件）”；只推进前端模拟，不发业务写请求。

| 场景 | 步长 | 完成 | 模拟耗时 | 最小人物中心距 | 小于0.52米的人物对×帧 | 最大行动人数 | 开始落座时朝向误差 | 转正时降低坐姿帧数 |
|---|---|---|---|---|---|---|---|---|
| 六人去程（返回前准备） | 1/60秒 | 6/6 | 210.5秒 | 0.55米 | 0 | 1 | 0 | 0 |
| 六人同时请求返回 | 1/60秒 | 6/6 | 112.5秒 | 0.55米 | 0 | 3 | 0 | 0 |
| 三进三出 | 1/60秒 | 6/6 | 154.5秒 | 0.55米 | 0 | 3 | 0 | 0 |
| 三进三出低帧率 | 0.1秒（10Hz） | 6/6 | 158.0秒 | 0.55米 | 0 | 3 | 0 | 0 |

均在完成时 active=0，无遗留行动。最多5人在座位等候，是请求已接收而非消失或被丢弃。
截图抽查了等候、直立转正和朝向锁定后的落座关键帧。主场景按模拟步长推进，不是逐帧人工审查全部真实播放画面。

## 回归与证据

```text
node --test tests/pedestrian-traffic.test.mjs tests/office-layout.test.mjs tests/motion-physics.test.mjs
tests 14 / pass 14 / fail 0
cmd /c "node --input-type=module --check < director.js"
cmd /c "node --input-type=module --check < pedestrian-traffic.js"
cmd /c "node --input-type=module --check < app.js"
cmd /c "node --input-type=module --check < tests/browser-lounge-actions.js"
```

已有浏览器逻辑路线检查：办公室交互25/25、行走阶段家具接触0；上下班往返25/25。这两项是轻量路线回归，不冒充真实蒙皮动作测试。

完整记录与浏览器实际读取源码的SHA-256：`E:/VirtualAIOffice/review-artifacts/pedestrian-yield-final-20261019.json`。
截图位于同一目录：`pedestrian-yield-return-queue.png`、`pedestrian-yield-mixed-queue.png`、`pedestrian-yield-turn-upright.png`、`pedestrian-yield-sit-aligned.png`。
新页面加载后复查控制台，结束时移除测试副本、恢复原人物和正常面板。

## 验收边界和刷新

- 通过的是上述固定人物、座位、出发顺序与两种步长场景；没有证明任意人数、所有出发排列、所有模型与随机动作组合都不会堵路。
- 人物采用水平净距代理，不是手臂、衣袖、头发、衣摆的逐顶点碰撞，也没有新增完整刚体/布料引擎。
- 手机实机性能、全部摄像机角度、全部真实时长画面逐帧人工审查仍未验证。
- 未启动、停止或重启服务，未触发真实巡检或任何 Paperclip 写请求；本次没有后端改动，只需 Ctrl+F5。
- 人工看三点：等候者是否留在原座位；通道放行后是否依次走动且最终完成；是否站着转正后再落座。
