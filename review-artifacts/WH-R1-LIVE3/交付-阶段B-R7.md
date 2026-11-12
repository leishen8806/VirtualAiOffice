分支 feat/wh-r1-live3-b；提交 d3f8adc

## 范围

- 仅处理第 307 条；未部署、未合并、未重启 3100/3200/3300。
- 真实服务端口：4396；main 基线独立服务端口：4397；两端均使用合成 company-id 文件，浏览器关闭后已删除。

## 车辆模型移动确认

R6 的结论仍成立：原实现只把交通状态写入 `runtimeVehicles.root.userData.traffic`，可见模型没有沿路线移动。

本轮已补齐：

- `dr-wh-r1-live1.js` 在每次 traffic advance 后调用 `runtimeVehicles.applyMotion()`；
- `dr-wh-r1-vehicles.js` 对实例化配送车网格、碰撞代理应用位置/朝向姿态；
- `dr-wh-r1-semitrailers.js` 增加 `setPose()`，半挂车 GLB LOD 批次按相同姿态刷新；
- 半挂车倒车阶段使用路线姿态中的 `yaw + π`，停靠和驶出继续沿路线更新。

本地单元/集成相关测试：23/23 PASS。

## 真实浏览器取证

真实服务 `http://127.0.0.1:4396/?place=drlife-warehouse&whr1=1&officeSample=1`，未使用 `page.route` 拦截。每张截图间隔 2 秒，共 6 张半挂车、6 张配送车：

| 组 | 文件 | SHA-256 |
|---|---|---|
| 半挂车 | `r7-live-captures/semitrailer-00.png` | `2dd5dc10af28647fa246a84f42a3eef41369d8dbc18b29001e53ffa4581f2a32` |
| 半挂车 | `r7-live-captures/semitrailer-01.png` | `2f0b0c2bdbe8336054cf8ce457420a6b79098464918f80d0aa103df112ffdbf8` |
| 半挂车 | `r7-live-captures/semitrailer-02.png` | `52622c3d33d560d39cb46f6205b873a477efa3209f7397d57ece8c044a3a3084` |
| 半挂车 | `r7-live-captures/semitrailer-03.png` | `1683a461e24fa6829f48196b5835b5cac9c62ac8927347851f36c84af2a2967b` |
| 半挂车 | `r7-live-captures/semitrailer-04.png` | `00f2651ebb493b26eec620803cd1103ea53e289555ad9e43d241c14f49e3a0bf` |
| 半挂车 | `r7-live-captures/semitrailer-05.png` | `b134d66067d0a169681d20d9b3b3beb95232e61644985670b36982140cd9d915` |
| 配送车 | `r7-live-captures/delivery-00.png` | `5fe13cfa9cb4ac480bfb74daa2dece047a59a5fe7d3e3b9d847d83dd6bd642d3` |
| 配送车 | `r7-live-captures/delivery-01.png` | `c2335e6a7569ddb8f62258f02a1397215c7858802b187e35fea3bb8a25382e2b` |
| 配送车 | `r7-live-captures/delivery-02.png` | `097a4d87924e123840861efa163e72f2004d346450b84fc118925a5032905fdd` |
| 配送车 | `r7-live-captures/delivery-03.png` | `61c5824c975f46c952cfd68e974b30e434674db05e62e6ed57e29c48d966acbc` |
| 配送车 | `r7-live-captures/delivery-04.png` | `fdcc7e8e1f818c7e1d7327e27d38d0484c38d317d61c7ff442288362411a4224` |
| 配送车 | `r7-live-captures/delivery-05.png` | `e2c78f71c0ff0e94735ac82d0ec1ebd56081548150e59325a1a3658fee057adc` |

## 30 秒性能对比

| 基线 | 平均 FPS | 最低 FPS | 绘制调用 |
|---|---:|---:|---:|
| `origin/main`（4397） | 3.31 | 0.27 | 平均 216.6，最大 234 |
| `feat/wh-r1-live3-b`（4396） | 3.86 | 3.56 | 205–234（随 LOD/可见性变化） |

当前分支相对 main 没有出现超过 15% 的帧率下降；绘制调用上限未超过 main 的 234。该采样为本机 Chrome 软件渲染，不能外推到低配设备。

## 验证分列

- 本地代码与测试：PASS（本地相关套件 23/23；`node --check` 通过；随后同步更新 `wh-r1-truck.test.mjs` 的 motion 断言）。
- 真实服务浏览器取证：PASS（4396，12 张截图已保存并校验 SHA-256）。
- main 性能对照：PASS（4397 独立工作树、同口径 30 秒采样）。
- PR #168 CI 三项：FAIL/待重跑（perf-budget PASS；ubuntu/windows 的全仓单测分别命中既有 `state-last-good.test.mjs` 的 undefined status 失败；另有旧 `wh-r1-truck.test.mjs` motion 断言已在本轮补齐，需推送后重跑）。
- 部署/合并：NOT_RUN（明确禁止）。
- 服务和浏览器：已关闭；临时基线工作树与合成 company-id 文件已删除。
