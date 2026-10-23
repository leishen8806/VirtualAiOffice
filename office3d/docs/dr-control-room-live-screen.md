# 三维中控室动态摘要屏

S2-14 B 部分为三维中控室增加默认关闭的动态演示摘要：

```text
/?place=drlife-warehouse&controlRoom=1&controlRoomLive=1
```

只有唯一参数值 `controlRoomLive=1` 会开启动态屏；参数缺失、重复或其它值均保留原静态摘要。

## 数据边界

- 基础快照与二维调度页一致：`buildSnapshot({ seed: 2808, timeSlice: 5 })`。
- 动态快照只通过 `demoSnapshotAt(base, elapsedMs)` 计算。
- 画面持续显示「模拟数据 · 示意」，不表示真实 WMS/TMS 或实时调度已经接通。
- 不发起网络请求，不新增轮询、AI 调用或 Paperclip 写操作。

## 显示内容

`dr-control-room-screen.js` 的纯绘制函数按 `1200×520` 绘制：

- S2-11 已验收的柬埔寨轮廓、路线和金边枢纽。
- 入库、出库、在途、准时率 KPI。
- 运单摘要。
- 最近 4 条演示事件。
- 持续可见的模拟数据水印。

## 生命周期与预算

- 复用原有 CanvasTexture，不新增纹理或绘制调用。
- 每 1000ms 检查一次；只有快照内容变化才设置 `needsUpdate`。
- 页面隐藏、场景根节点不可见、手动停止或销毁时清除定时器。
- 页面恢复时从暂停的演示时间继续，不补播隐藏期间的时间。
- `stop()` 回到静态摘要；`dispose()` 只清理中控室自身资源。
- `buildDrControlRoom()` 返回 `start()`、`stop()`、`setDemo(provider)` 和只读 `liveMetrics()`。

## A′ 停止与页面生命周期

S2-13b 验收后，二维调度页已统一采用“停止并重置”：

- Canvas、KPI、运单、作业流水和演示时间一并回到 `buildSnapshot({ seed: 2808, timeSlice: 5 })` 的静态初始快照。
- 状态恢复为「静态演示 · 默认关闭」，页面恢复不会自行启动。
- `pagehide` 销毁当前演示实例，`pageshow` 重建唯一的停止态实例，以兼容 bfcache。
- 重复初始化会先销毁旧实例；点击、`visibilitychange`、`pagehide`、`pageshow` 监听器及动画帧不会叠加。
