---
id: W-RC-R4
base: integration/vis2-dr-rc1（W-V1-R4 推送后的分支头）
branch: integration/vis2-dr-rc1
scope:
  - office3d/tests/dr-vis2-rack-cell.test.mjs
  - office3d/docs/dr-vis2-rack-cell.md
  - office3d/dr-vis2-rack-cell.js（只允许改清单 note 字符串，不改几何）
  - dispatch/trae/outbox/W-RC-R4-report.md
budget: 45min
---
# W-RC-R4：补回托盘高度守护，收紧清单匹配，同步文档（W-RC-R3 复审收尾）

W-RC-R3（`a1df093`）已通过独立复审：卡上 6 个变异全部被新测试抓住，产品代码只改了字符串和注释，几何指纹不变。复审报告：`review-artifacts/Q-V1/rack-cell-independent-R3/`。本卡处理复审留下的 P2 一项和 P3 几项，**只改测试和文档**。

在 `integration/vis2-dr-rc1` 上，接在 W-V1-R4 之后**追加提交**；不改写已审提交、不 force push；与 W-V1-R4 分成不同提交。

## 必须修（P2-1）：货位托盘整体上抬时测试抓不到

R3 按卡片把 `near(box(carton).y0, D.palletHeight)` 这条常量比对删掉了，改成纸箱和实测托盘面互相比对。副作用是：**托盘面和纸箱一起上抬**，悬空在托盘腿上方时，新测试照样通过。

- 复现（独立审查员变异 X1）：把 `dr-vis2-rack-cell.js:213` 的 `slotBatch.add(slotX, D.palletHeight - 0.015` 改为 `D.palletHeight + 0.05 - 0.015`，同时把 `:214` 纸箱的 y 也加 0.05。结果：新测试 21/21 通过，旧测试能抓住。
- 修复：保留现有的实测比对，并加一条"每个货位托盘面底 = 同一货位托盘腿（`sy ≈ 0.09` 实例）的顶"（容差 1e-4）；也可以恢复 `near(deckTop, D.palletHeight)`。
- 同时补车载托盘（独立审查员 P3-6、变异 X2）：在 `:191` 把 `loadTop = platformTop + D.palletHeight` 改成 `+ D.palletHeight + 0.05` 时，新旧测试都抓不到。加一条"车载托盘面底 = 承托板 `pallet-bearer*` 顶"。

## 顺手修（P3）

1. **清单精确匹配**：`tests/dr-vis2-rack-cell.test.mjs:376` 用前缀匹配（`name.startsWith(legacy + '-')`）。`campus-shuttle` 总能被 `campus-shuttle-static` 满足；把清单中的 `campus-shuttle` 改成 `campus-racks` 也能通过（变异 X5）。改为 `legacyRoot.getObjectByName(legacy)` 精确匹配，清单 4 项都必须存在。
2. **文档 §五 与代码同步**：`docs/dr-vis2-rack-cell.md:39,41` 仍写 `campus-shuttle` 被"替换"、展示位"（预留）"。代码已经改为"替换模式下保留作宿主容器"与"（模拟）"。请同步修改，并说明 `:33` note 中"需 Trae 改标签文案"这个待办是否还成立。
3. **文档 §九 / 回执的数字**：把"新增 5 项"按归属拆开（本卡 +1、月台卡 +4）；变异前缀与复审编号对齐；回执行数写准确。

## 证明断言有效

在回执中贴出以下变异的结果，并说明每次运行后已恢复：X1（货位托盘面 + 纸箱整体 +5 cm）、X2（车载 `loadTop` +5 cm）、X5（清单 `campus-shuttle → campus-racks`）。**新测试必须失败**；作为对照，用 `a1df093` 的测试跑同样的变异。

## 不做

不改几何与行为（产品文件只允许改清单 note 字符串）；不碰月台、`dr-campus-*`、共享模块、办公室、中控台；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后**务必把完整 SHA 告诉派发人**。
- 回执 `dispatch/trae/outbox/W-RC-R4-report.md`：改动清单、变异结果表、测试真实输出末尾。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs`。
- 完成后停下，等待独立复审（货架单元由独立审查员复审）。
