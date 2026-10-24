# W-RC-R2 货架单元守卫与纸箱贴合报告

基线：`integration/vis2-dr-rc1 @ c03540ae3ca736509703fd110a8d5db32165299d`（已先推送 W-V1-R2）。

## 做到

- 货架纸箱、穿梭机载货和货位纸箱的第一层底面都贴合托盘顶面，层间的 `0.012m` 缝隙保留在每层顶部。
- 真实生产模块在合并前构建，逐个测量 10 个 `campus-racks-support` 实例的世界包围盒；每个底面为 `CAMPUS_FINISHED_FLOOR_Y = -0.54`。
- 生产 registry 每帧比较 VIS2 单元与 `campus-shuttle` 的完整 `{ z, lift, carrying, occupied, status }`，直到到达 `delivery`；此时状态灯必须为 `VIS2_COLORS.lampWork`。
- 增加完成面 `+0.002m` 引导面守卫，并将旧对象替换检查改成真实构建路径；不再通过源码正则推断对象存在。
- 将 `campus-racks-support` 命名改回单行三元赋值，更新组件文档与 R1 报告补记。

## 变异验证

所有变异均在隔离副本中执行：

```text
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs
```

| 变异 | 结果 | 首个失败守卫 |
| --- | --- | --- |
| M5：宿主不转发 `status` | KILLED | `real campus module wiring…` 在 `t=100` 的逐帧 deepEqual |
| M7：删除 `delivery` 灯映射 | KILLED | `delivery uses the work lamp color` |
| M8：`supportOffset = 0` | KILLED | `support instance 0 rests on the finished floor` |
| M13：`put()` 忽略 support 偏移 | KILLED | `support instance 0 rests on the finished floor` |
| M10：货架纸箱整体上移 `0.05m` | KILLED | `first-layer carton rests on its pallet deck` |
| M11：货位纸箱整体上移 `0.05m` | KILLED | `slot carton rests on its pallet deck` |
| M9：引导面改回完成面 `+0.03m` | KILLED | `shuttle reserve guide stays 2 mm above the finished floor` |

## 测试

| 命令 | 结果 |
| --- | --- |
| `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs` | 20/20 通过 |
| 定向：同上加 `tests/dr-campus-*.test.mjs` | 51 项：49 通过、2 个既有失败 |
| 全量串行：`tests/*.test.mjs` | 1048 项：1030 通过、17 个既有环境失败、1 跳过 |

定向既有失败是 `dr-campus-motion.test.mjs` 的隐藏 root 回调契约（`0 !== 1`）及 `dr-campus-shell.test.mjs` 缺少 `office3d-backup-s2-4/app.js`。全量失败另含缺失历史备份、本地 JSON 和 fixture；R2 专项测试 20/20 通过，未观察到 R2 新失败。

## 改动逐行清单

| 文件 | 改动 |
| --- | --- |
| `office3d/dr-vis2-rack-cell.js` | 三处纸箱中心高度改为从托盘顶面贴合计算。 |
| `office3d/dr-campus-racks.js` | support 网格名称恢复为单行三元赋值。 |
| `office3d/tests/dr-vis2-rack-cell.test.mjs` | 增加世界包围盒、逐帧状态/灯色、纸箱贴合、引导面和真实替换路径守卫。 |
| `office3d/docs/dr-vis2-rack-cell.md` | 更新串行命令、变异结论和过期测试说明。 |
| `dispatch/trae/outbox/W-RC-R1-report.md` | 补充状态种数、5 个 `dr-campus-*` 文件与 interior 模块意图。 |

## 没做到

- 未修改月台、办公室、二维中控台、注册结构或业务行为。
- 未部署、未启停服务、未合并 main、未 force push。

## 未验证

- 未进行主场景浏览器/GPU 视觉验收；本卡范围仅为货架行为守卫与几何回归。
