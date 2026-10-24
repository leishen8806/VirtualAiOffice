# W-RC-R1 货架单元接线修复报告

基线：`integration/vis2-dr-rc1 @ b0d4c74f3632c6d8b2c0a19c97e2d528110c4fa3`
范围：货架生产接线、穿梭状态、完成面、专项回归与文档；未修改月台样板、办公室、中控台、共享布局或服务。

## 做到

1. 真实 `campusModules` 注册路径现在由专项测试直接构建，不再覆盖同名 `vis2Rack` 工厂。
   - 新单元组的世界 Y 为 `CAMPUS_FINISHED_FLOOR_Y = -0.54`。
   - 旧 `campus-racks-static`、旧穿梭机车体、旧轨道和枕木不进入合并批次。
   - `campus-racks-support` 仅保留 10 个实例：3 个工位、4 个收货门、3 个发货门，并贴合完成面。
2. 穿梭机宿主完整传递 `{ z, lift, carrying, occupied, status }`。
   - 构件支持 `delivery` 状态灯。
   - 实际帧推进后，货位状态会从 `[true,false,true]` 更新为 `[false,true,true]`，空车状态同步保留。
3. 货位托盘东移至 `centerX + 1.40`，在三个货位位置均与穿梭机车体无交叠。
4. 穿梭机引导面降为完成面上方 `0.002m`，不再横穿轨道、枕木和托盘底腿。
5. 更新组件文档中的完成面、状态接线和旧对象替换说明。

## 变异验证

在临时副本中仅修改目标文件后，执行：

```text
node --max-old-space-size=2048 --test --test-name-pattern="real campus module wiring" --test-timeout=60000 tests/dr-vis2-rack-cell.test.mjs
```

| 变异 | 结果 |
| --- | --- |
| `baseY: CAMPUS_FINISHED_FLOOR_Y` 改为 `0` | 已杀死：`0 !== -0.54` |
| `inside(plan, low, replaceRackCell)` 改为 `inside(plan, low, false)` | 已杀死：support 从预期 `10` 变为 `203`，旧货架重新进入结果 |
| 删除 `carrying/occupied/status` 转发 | 已杀死：实际为 `[true,false,true]`，预期帧状态为 `[false,true,true]` |

## 测试

| 命令 | 结果 |
| --- | --- |
| `node --max-old-space-size=2048 --test --test-timeout=60000 office3d/tests/dr-vis2-rack-cell.test.mjs` | 18/18 通过 |
| 五个 `dr-campus-*` 专项串行回归 | 49 项中 47 通过；2 个既有失败 |
| 全量串行回归 | 1045 项：1027 通过、17 失败、1 跳过 |

全量失败集与基线已知环境限制一致，未出现本卡新增失败。失败包含缺少历史备份/本地 JSON 的断言，以及范围外的 `dr-campus-motion` 隐藏 root 回调契约冲突；后者建议由 registry 负责人决定是否恢复“隐藏时仍回调”的旧语义。

## 预览证据

使用严格路由静态预览重新采集三个机位。全部 9 个请求均映射到候选工作树文件，未映射请求 0、控制台错误 0。预览为组件预览而非部署或主场景。

- 全景、货架中景、巷道近景：每个 `15 calls / 25,802 triangles / 约 16.67ms`。
- 构件自身摘要：`10 calls / 25,380 triangles`。

任务卡要求的主场景仓配全景和“有货货位”近景未验证：本卡未获授权启动、重启或接线主场景，现有静态入口只验证组件。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `office3d/dr-campus-racks.js` | +17 / -4 |
| `office3d/dr-campus-shell.js` | +4 / -1 |
| `office3d/dr-campus-shuttle.js` | +7 / -1 |
| `office3d/dr-vis2-rack-cell.js` | +2 / -2 |
| `office3d/tests/dr-vis2-rack-cell.test.mjs` | +55 / -13 |
| `office3d/docs/dr-vis2-rack-cell.md` | +9 / -9 |

## R2 复审补记

- 同一循环推进 6,000 帧时，接线前的 fixture 只有 `idle` 1 种状态；生产 `shuttleFrame` 接线后观察到 12 个不同状态组合，并覆盖 `delivery`。
- `dr-campus-racks.js`：引入完成面常量、替换模式只保留 support、support 实例整体使用 `baseY` 偏移并写入元数据。
- `dr-campus-shell.js`：将 `campus-shuttle-reserve` 从旧偏移改为完成面 `+0.002m`。
- `dr-campus-shuttle.js`：外部 VIS2 构件存在时转发完整 `{ z, lift, carrying, occupied, status }`。
- 其余两个 `dr-campus-*` 文件是 `dr-campus-modules.js`（注册生产构件并传完成面）与 `dr-campus-registry.js`（现有合并路径）；R1 未修改 `dr-campus-interior.js`。后者不在 `campusModules` 是有意为之：它包含独立动态屏刷新生命周期，不应被本卡的静态货架替换接线带入。

## 没做到

- 未修改或接入月台样板。
- 未执行生产部署、服务启停或主场景注册结构变更。
- 未将静态组件预览表述为主场景验收。

## 未验证

- 主场景同机位浏览器截图与 GPU 实测。
- registry 隐藏 root 回调的范围外既有失败修复。
