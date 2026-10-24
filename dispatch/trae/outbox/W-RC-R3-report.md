# W-RC-R3 货架单元测试补强与文档收尾报告

基线：`integration/vis2-dr-rc1 @ fe3454919ed67761383803736931d9134098255f`，其货架基线为 `656f473763e0fb534f2bec7b8ff482c6492d45ea`。

## 做到

- 对 `vis2-shuttle-load` 的 `geometry.userData.parts` 实测 `pallet-deck`、首层 `carton0*` 与上层 `carton1*` 的包围盒，验证贴面与 12mm 层间隙。
- 货位托盘断言改为从实际 slot deck 实例取顶面；货架托盘断言改为检查每个首层纸箱与每列上层纸箱。
- `VIS2_REPLACES` 逐项在真实 legacy 构建结果中按名称/前缀验证；更新穿梭机宿主保留和标签文案说明。
- 校正 `slotX = centerX + 1.4` 注释，更新 R2/R3 变异编号及全量回归数字。

## 变异验证

所有变异都在隔离副本执行：

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs
```

| 变异 | 结果 | 失败守卫 |
| --- | --- | --- |
| M15：车载纸箱整体 +5cm | KILLED | 首层纸箱贴 `pallet-deck` |
| M18：车载纸箱恢复旧公式 | KILLED | 首层纸箱贴 `pallet-deck` |
| M23：车载托盘面 +5cm | KILLED | 首层纸箱贴实测托盘面 |
| M21：货架 `ix > 0` 纸箱 +5cm | KILLED | 每托盘四个首层纸箱 |
| M22：货位托盘面 +5cm | KILLED | 货位纸箱贴实测 deck |
| M24：货架上层纸箱 −5cm | KILLED | 上下层纸箱间隙 12mm |

六个副本均为 21 项中 20 通过、1 个预期变异失败。

## 测试

| 命令 | 结果 |
| --- | --- |
| `node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs` | 21/21 通过 |
| 同上加 `tests/dr-campus-*.test.mjs` | 52 项：50 通过、2 个既有环境失败 |
| `node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/*.test.mjs` | 1053 项：1035 通过、17 个既有环境失败、1 跳过 |

全量与 `656f473` 的 1048 项：1030 通过、17 失败、1 跳过相比，新增 5 项均通过，失败数不变。既有失败包括隐藏 root 回调契约、缺失历史备份、本地 JSON 与 fixture。

## 逐行改动清单

| 文件 | 精确行级改动 |
| --- | --- |
| `office3d/dr-vis2-rack-cell.js:31,33,207` | 更正 `campus-shuttle` / 标签说明；货位注释 `+1.25 → +1.4`。不改几何或行为。 |
| `office3d/tests/dr-vis2-rack-cell.test.mjs:37-47` | 新增 `partBox()`，按 geometry part 顶点计算世界包围盒。 |
| `office3d/tests/dr-vis2-rack-cell.test.mjs:118-151` | slot 实测 deck、货架逐首层及 12mm 层间断言。 |
| `office3d/tests/dr-vis2-rack-cell.test.mjs:197-205` | 车载 pallet-deck / carton0 / carton1 实测断言。 |
| `office3d/tests/dr-vis2-rack-cell.test.mjs:373-377` | `VIS2_REPLACES` 名称/前缀逐项验证。 |
| `office3d/docs/dr-vis2-rack-cell.md:59,75-80` | §九命令、R2/R3 变异名称与 R3 定向/全量数字。 |
| `dispatch/trae/outbox/W-RC-R3-report.md:1-67` | 本卡变异、验证与范围记录。 |
| `dr-campus-racks.js` / `dr-campus-shell.js` / `dr-campus-shuttle.js` / `dr-campus-modules.js` / `dr-campus-registry.js` / `dr-campus-interior.js` | 本卡无行改动。 |

`dr-campus-interior` 的历史说明已核对：`f3506f2` 从 `campusModules` 移除它，是为了退休旧 interior 注册，使私有替换构件能整合且不生成重复场景对象；并非动态屏刷新生命周期原因。

## 没做到

- 未修改货架、托盘、纸箱、穿梭机的几何或行为；仅更正一处注释和替换清单文字。
- 未修改月台、`dr-campus-*`、共享模块、办公室或中控台。
- 未部署、未启停服务、未合并 main、未 force push。

## 未验证

- 未新增浏览器/GPU 采集；本卡范围为测试强度与文档精度。
