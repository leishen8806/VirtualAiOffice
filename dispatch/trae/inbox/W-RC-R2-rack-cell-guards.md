---
id: W-RC-R2
base: integration/vis2-dr-rc1 @ ba1e9e21e2af70fb57eba0b710c9cbfe3b796b77（若 W-V1-R2 已先推送，则从其提交继续）
branch: integration/vis2-dr-rc1
scope:
  - office3d/dr-vis2-rack-cell.js
  - office3d/dr-campus-racks.js
  - office3d/dr-campus-shell.js
  - office3d/tests/dr-vis2-rack-cell.test.mjs
  - office3d/docs/dr-vis2-rack-cell.md
  - dispatch/trae/outbox/W-RC-R1-report.md
  - dispatch/trae/outbox/W-RC-R2-report.md
budget: 2h
---
# W-RC-R2：货架单元守护断言补齐 + 纸箱贴合 + 文档与报告

**顺序**：先把手上的 `W-V1-R2`（月台）提交推送，再做本卡；两卡改的文件不重叠，但要串行提交。在 `integration/vis2-dr-rc1` 上**继续追加提交**，不改写已审提交、不 force push。

## 独立复审结论（ba1e9e2，代码检查：未通过，返工量小）

行为层面已修好，请保留（均有实测）：
- 卡片三个接线变异（baseY 改 0、旧货架叠回、删 `setShuttle`）全部被新测试 `real campus module wiring…` 杀死；
- 穿梭机逐帧驱动 6000 帧与旧逻辑 0 帧不一致，状态种数 1 → 12，`delivery` 显示作业色；
- `slotX = centerX + 1.4` 后车体与有货货位纸箱相交 4 → 0，余量 0.063 m；
- `campus-racks-support` 10 个实例底面落到 −0.54；
- 引导面降到完成面 +0.002。

不通过：卡片要求的三条守护断言有两条没写、一条写成了恒真；纸箱悬空和源码正则测试没改。以下变异在 `ba1e9e2` 上**存活**：

| 变异 | 说明 |
|---|---|
| M5 | 宿主不转发 `status` |
| M7 | `STATUS_LAMP` 删掉 `delivery` |
| M8 | `supportOffset` 固定为 0（support 回到悬空 0.54） |
| M13 | `put()` 不加 `supportOffset`（几何悬空、元数据不变） |
| M10 | 货架纸箱整体 +5 cm |
| M11 | 货位纸箱整体 +5 cm |
| M9 | 引导面改回 +0.03（观察项，建议一并守护） |

## 要做（行号按 ba1e9e2）

1. **R1-1 support 底面断言（P2）**：`tests/dr-vis2-rack-cell.test.mjs:225-229` 只比对 `root.userData.campusRackSupport.baseY`（传入参数的回显）。改为：在合并前直接调用 `campusModules` 各工厂构建，对 `campus-racks-support` 每个实例计算世界包围盒，断言 `min.y` 等于 `CAMPUS_FINISHED_FLOOR_Y`（容差 1e-6）。M8、M13 必须被杀死。
2. **R1-2 状态逐帧一致（P2）**：`tests/…:236-245` 只推进 8 帧、断言 `status` 属于 `{pickup, delivery, idle}`，夹具默认 `idle` 也能通过。改为：逐帧把 `cell.summary().state` 的 `z / lift / occupied / carrying / status` 与 `campus-shuttle` 组的帧数据做 deepEqual，一直推进到至少出现一次 `delivery`；并断言 `delivery` 时状态灯颜色等于 `VIS2_COLORS.lampWork`。M5、M7 必须被杀死。
3. **R1-3 纸箱贴合（P3）**：`dr-vis2-rack-cell.js:113`、`:194`、`:214` 纸箱底面比托盘面高 0.006 m，代码未改。把 0.012 的层缝放到每层顶部：中心 y = `palletTop + layerHeight * layer + (layerHeight - 0.012) / 2`（另两处同理）。`tests/…:99` 的断言 `near(y0, top) || y0 > top` 对悬空恒为真，改为 `near(y0, deckTop, 1e-4)`，去掉 `|| y0 > top`。M10、M11 必须被杀死。
4. **R1-4 去掉源码正则测试（P3）**：`tests/…:263-266`"the replacement list names real legacy objects…"仍用正则匹配源码。改为对构建结果断言：分别以 `replaceRackCell` 为 true / false 构建 racks 与 shuttle，检查对象名或合并批次 `sourceIds`。然后把 `dr-campus-racks.js:53-54` 为迁就正则写成的"先赋 static、再条件覆盖"恢复为单行三元赋值。
5. **引导面守护（建议）**：`dr-campus-shell.js` 引导面高度加一条断言（完成面 +0.002 ± 1e-6），使 M9 被杀死。
6. **R1-5 文档（P3）**：`docs/dr-vis2-rack-cell.md` §九第 59 行（concurrency=2）、第 73 行（"纸箱整体上移会失败"，与实测不符）、第 74–75 行（"14 项变异全部被抓住"、"1184 用例 / 17 失败"）按本轮实际结果重写。
7. **R1-6 报告补项（流程）**：在 `W-RC-R1-report.md` 补齐卡片要求但缺失的内容，或在 `W-RC-R2-report.md` 中补：一个循环内状态种数前后对照（1 → 12）；`dr-campus-*.js` 改动逐行清单；`dr-campus-interior` 被移出 `campusModules` 是否有意；测试文件数更正（`dr-campus-*` 是 5 个，不是 6 个）。

## 不做

不改月台样板（属于 `W-V1-R2`）；不改穿梭机接线行为、`slotX` 与引导面高度（已修好，只补守护）；不改办公室、二维中控台、共享布局与注册结构；不合并 main、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 报告 `dispatch/trae/outbox/W-RC-R2-report.md`：做到 / 没做到 / 未验证；改动逐行清单；**上表 7 个变异逐个在新代码上运行的结果**（期望全部被杀死，附测试输出末尾）。
- 测试（带资源上限）：定向 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs tests/dr-campus-*.test.mjs`；全量 `tests/*.test.mjs`；失败按名称与 `ba1e9e2` 比较，不得新增。
- 完成后停下。复审由与 `dr-vis2-rack-cell.js` 原作者无关的独立审查员进行。
