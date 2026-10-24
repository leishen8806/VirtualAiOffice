---
id: W-RC-R3
base: integration/vis2-dr-rc1 @ 656f473763e0fb534f2bec7b8ff482c6492d45ea（若 W-V1-R3 已先推送，则从其提交继续）
branch: integration/vis2-dr-rc1
scope:
  - office3d/dr-vis2-rack-cell.js
  - office3d/tests/dr-vis2-rack-cell.test.mjs
  - office3d/docs/dr-vis2-rack-cell.md
  - dispatch/trae/outbox/W-RC-R3-report.md
budget: 1.5h
---
# W-RC-R3：货架单元测试补强与文档收尾（小卡，P3）

**顺序**：先完成并推送 `W-V1-R3`（月台），再做本卡；两卡文件不重叠，但串行提交。在 `integration/vis2-dr-rc1` 上**继续追加提交**，不改写已审提交、不 force push。

## 独立复审结论（656f473，代码检查：通过）

W-RC-R2 已通过：
- 卡片 7 个存活变异全部被杀死，上一轮已杀死的 7 个无退化；
- 纸箱间隙 0.006 → 0（货架、货位、车载三处）；
- support 底面 −0.54；
- 6000 帧状态 0 不一致；
- 车体与纸箱相交 0。

本卡只补测试强度与文档精度，**不改任何几何或行为**（除第 5 条注释）。

下表是复审中新做、目前**存活**的变异，本卡完成后必须全部被杀死：

| 变异 | 内容 |
|---|---|
| M15 | 穿梭机载货纸箱整体 +5 cm |
| M18 | 穿梭机载货纸箱回退旧公式（悬空 6 mm） |
| M23 | 穿梭机载货托盘面 +5 cm |
| M21 | 货架纸箱只把 ix > 0 那一列抬高 5 cm |
| M22 | 货位托盘面 +5 cm（纸箱陷进托盘） |
| M24 | 货架上层纸箱下沉 5 cm（层间互穿；早已存在的缺口，本卡一并补） |

## 要做（行号按 656f473）

1. **N1 车载纸箱守护**：`dr-vis2-rack-cell.js:194` 的 `loadBuilder` 纸箱修复没有测试。从 `vis2-shuttle-load` 的 `geometry.userData.parts` 取 `pallet-deck` 与 `carton0*` 的包围盒，断言首层纸箱底面 = 托盘面顶（容差 1e-4）。杀死 M15、M18、M23。
2. **N2 货位 / 货架纸箱断言改为实测**：
   - `tests/dr-vis2-rack-cell.test.mjs:107` 用常量 `D.palletHeight` 比对货位纸箱，改为从货位实例中取托盘面（`sy ≈ 0.03`），按 `slot.z` 配对后比较 `deck.y + deck.sy / 2`；杀死 M22。
   - `:116-117` 用 `Math.min(...)` 只检查每个托盘上最低的纸箱，改为"每个首层纸箱（底面低于托盘面 + 0.01）都贴合托盘面"；杀死 M21。
   - 加层间断言：上层纸箱底面 = 下层纸箱顶面 + 0.012；杀死 M24。
3. **N4 `VIS2_REPLACES` 清单无测试**：`dr-vis2-rack-cell.js:29-34` 的清单在旧正则测试删除后不再被校验。在 `rack and shuttle replacement paths…` 测试中遍历 `VIS2_REPLACES`，断言每个 `legacy` 名在 `replaceRackCell: false` 的构建结果中存在（按名称或前缀）。清单内容过期之处（`campus-shuttle` 组在替换模式下仍作为宿主保留；标签 note 写"（预留）"而代码是"穿梭机展示位（模拟）"）按实际更正。
4. **N3 文档 §九**：`docs/dr-vis2-rack-cell.md:63-71` 的 M8 / M9 / M10 / M11 / M13 指原模块变异，`:75` 同一批编号又指复审变异，改为带前缀（如"复审 R1-M5"）或直接写变异内容；`:76` 写入本轮全量实际数字与对照基线。
5. **N5 注释**：`dr-vis2-rack-cell.js:207` 注释仍写"x = 中线 + 1.25"，代码是 `+ 1.4`，更正注释。
6. **N6 报告**：报告给出 `dr-campus-*.js` 与本卡文件的逐行改动清单（不是按文件摘要）；`dr-campus-interior` 被移出 `campusModules` 的理由与提交 `f3506f2` 的说明不一致，查清后写明。

## 不做

不改货架、托盘、纸箱、穿梭机的几何与行为（第 5 条注释除外）；不改月台、`dr-campus-*.js`、共享模块、办公室与中控台；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 报告 `dispatch/trae/outbox/W-RC-R3-report.md`：做到 / 没做到 / 未验证；逐行改动清单；**上表 6 个变异逐个在新代码上运行的结果**（期望全部被杀死，附测试输出末尾）。
- 测试（带资源上限）：定向 `node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs tests/dr-campus-*.test.mjs`；全量仅在空闲内存充足时运行，失败按名称与 `656f473` 比较，不得新增。
- 完成后停下。复审由与 `dr-vis2-rack-cell.js` 原作者无关的独立审查员进行。
