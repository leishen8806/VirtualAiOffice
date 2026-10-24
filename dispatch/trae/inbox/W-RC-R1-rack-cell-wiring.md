---
id: W-RC-R1
base: integration/vis2-dr-rc1 @ b0d4c74f3632c6d8b2c0a19c97e2d528110c4fa3
branch: integration/vis2-dr-rc1
scope:
  - office3d/dr-vis2-rack-cell.js
  - office3d/dr-campus-shuttle.js
  - office3d/dr-campus-racks.js
  - office3d/dr-campus-shell.js
  - office3d/tests/dr-vis2-rack-cell.test.mjs
  - office3d/docs/dr-vis2-rack-cell.md
  - dispatch/trae/outbox/W-RC-R1-report.md
budget: 4h
---
# W-RC-R1：VIS2 货架单元接线修复（测试覆盖真实注册路径 + 穿梭机状态 + 互穿 + 悬空）

在 `integration/vis2-dr-rc1` 上从 `b0d4c74` **继续追加提交**，不改写已审提交、不 force push。与 `W-V1-R2`（月台）串行，不交叉编辑同一文件。

## 独立审查结论（b0d4c74，代码检查：未通过）

组件本体正确，请保留：完成面 −0.54 显式传入，货架、轨道、货位底面实测都落在 −0.54；实例容量充足、包围盒有限、`dispose()` 可重复调用；生产路径下旧货架、旧轨道、旧车体已停用，无重复渲染；定向 18/18。

不通过的原因如下（行号按 `b0d4c74`）。

## 要做

1. **P1 测试没有覆盖真实接线路径**：`tests/dr-vis2-rack-cell.test.mjs:197-198` 先注册全部 `campusModules`，再用同名 `vis2Rack` 覆盖生产工厂。被覆盖后不传 `baseY`、不写 `root.userData.vis2RackCell`，`racks` 与 `shuttle` 退回旧路径——测试构建的是"新旧两套叠加"的场景，断言照样通过。以下三个接线变异在本测试和 6 个 campus 测试中**全部存活**：
   - `dr-campus-modules.js` 中 `baseY: CAMPUS_FINISHED_FLOOR_Y` 改成 `0`（货架整体浮起 0.54 m）；
   - `dr-campus-racks.js` 中 `inside(plan, low, replaceRackCell)` 改成 `inside(plan, low, false)`（旧货架叠回来）；
   - `dr-campus-shuttle.js` 删掉 `activeVisualCell.setShuttle(...)`（新穿梭机永远不动）。

   修复：新增测试，只注册 `campusModules`，**不覆盖**，然后断言：
   - `root.userData.vis2RackCell.group.position.y === CAMPUS_FINISHED_FLOOR_Y`；
   - 不存在 `campus-shuttle-vehicle`，合并批次的 `sourceIds` 不含 `campus-shuttle-rail-*`、`campus-shuttle-sleeper-*`、`campus-racks-static`；
   - `campus-racks-support` 恰好 10 个实例（3 工位 + 4 收货门 + 3 发货门）；
   - 推进 `shuttle.onFrame` 后 `cell.summary().state.z` 会变化。

   原第 197–198 行那条测试改名为"fallback 路径"或删除。交付时在报告里附上：上述三个变异在新测试下**被杀死**的输出。
2. **P2 穿梭机状态丢失**：`dr-campus-shuttle.js:224` 只传 `{ z, lift }`。旧逻辑一个循环出现 12 种 `{occupied, carrying, status}`，新构件始终是 `occupied [true,false,true] / carrying true / idle`：空车也画着货、货位占用不变、状态灯常绿。改为同时传 `carrying`、`occupied`、`status`；`dr-vis2-rack-cell.js:156` 的 `STATUS_LAMP` 只认 `idle/moving/pickup/put`，而 `dr-campus-shuttle-logic.js:98` 会产出 `'delivery'`——在构件里补 `delivery`，或在宿主侧映射到 `put`。加断言：推进若干帧后 `cell.summary().state` 与 `shuttleFrame` 一致。
3. **P2 车体与有货货位纸箱互穿**：`dr-vis2-rack-cell.js:209` `slotX = plan.centerX + 1.25`；车体半宽 0.85、侧条外沿 0.862，货位纸箱内沿在中线 +0.775。车停在任一有货货位时相交 dx 0.075 m、dy 0.214 m、dz 0.545 m，生产场景每个循环都会出现。建议 `slotX = centerX + 1.40`（纸箱内沿 0.925 > 0.862，托盘外沿仍在展示带 x1 = −144 以内）。加断言：车体在每个货位 z 处都不与有货货位实例相交。
4. **P2 保留的工位与月台门悬空 0.54 m**：`dr-campus-racks.js:41` 的 support 实例底面在世界 y = 0，完成面是 −0.54（`dr-campus-shell.js:4`）。这一问题 main 上就存在，但新货架贴地后同屏反差明显。support 实例 y 加上 `CAMPUS_FINISHED_FLOOR_Y`（至少在 `replaceRackCell` 时），加断言：support 实例底面 = 完成面。
5. **P3**（同卡顺手处理）：
   - `dr-campus-shell.js:23` 穿梭机展示带的半透明引导面高出完成面 0.03 m，横穿枕木和货位托盘底腿 → 货架单元存在时降到完成面 +0.002（配合 polygonOffset），或隐藏；
   - `dr-vis2-rack-cell.js:113/194/214` 所有纸箱悬空 6 mm（层缝放在了底部）→ 底面对齐托盘面或下层顶面，在测试 62–73 行补"贴合"断言（纸箱整体抬高 5 cm 的变异目前存活）；
   - `tests/...:223` 用正则匹配源码文本来证明旧对象存在，提交 `1168079` 为迁就该正则改写了代码 → 改为对实际构建结果断言（与第 1 条合并）；
   - `docs/dr-vis2-rack-cell.md` §二/§五/§十 仍写 baseY 默认 0、§八 写不改 `dr-campus-shuttle.js`、§四 夹具与旧初始状态"一致"的说法不对（旧初始 `carrying:false`）→ 按当前接线更新。

## 范围外（只报告，不改）

- `dr-campus-motion.test.mjs:139`"registry scene callback runs even without visible campus batch…"在本分支失败（registry 新增的 `!root.visible` 帧门控与旧契约冲突），需 registry 负责人裁定，在报告中给出建议。
- `dr-campus-interior` 在 `f3506f2` 被移出 `campusModules`，确认是否有意。

## 不做

不改月台样板（`W-V1-R2`）；不改办公室、二维中控台、共享布局与注册结构；不合并 main、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 报告 `dispatch/trae/outbox/W-RC-R1-report.md`（放工作分支）：做到 / 没做到 / 未验证；改动文件与行数（`dr-campus-*.js` 逐行列出）；三个接线变异被杀死的测试输出；穿梭机状态前后对照（一个循环内出现的状态种数）。
- 浏览器截图（本次 SHA 新采集）：主场景仓配区全景与穿梭机停在有货货位的近景，与 `b0d4c74` 同机位成对；截图不进源码历史。
- 测试：定向 `tests/dr-vis2-rack-cell.test.mjs` 与 6 个 `dr-campus-*` 测试，以及全量（`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/*.test.mjs`）真实输出末尾；失败按名称与 `b0d4c74` 比较，不得新增。
- 完成后停下。复审由与 `dr-vis2-rack-cell.js` 原作者无关的独立审查员进行。
