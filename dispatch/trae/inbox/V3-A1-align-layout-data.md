---
id: V3-A1
base: integration/office-evidence-20261023 @ 345cd39f7dddebf4e4e61e146af7a283cd415088（先合入 fix/v3-region-focus @ 4277ee4e95300af1adf57a6ca9798ce8f73d2c96）
branch: feat/v3-align
scope:
  - office3d/office-layout.js
  - office3d/office-v3-public-path.js
  - office3d/tests/office-v3-align-data.test.mjs
  - office3d/docs/v3-layout-align-plan.md
  - office3d/docs/v3-layout-align-plan.json
  - office3d/docs/v3-layout-align-plan.svg
  - office3d/docs/v3-layout-align-check.mjs
  - dispatch/trae/outbox/V3-A1-report.md
budget: 3h
---
# V3-A1：格局对齐实施第 1 步——冻结新布局数据、门洞与路线图（并行变体，不影响现有 V3）

董事会已**批准 V3-L1 方案甲**（`plan/v3-layout-align` @ `83ecc1b`）。实施按方案拆成 4 步：**本卡 = 第 1 步（Trae）**，之后依次为：第 2 步 Codex 外壳 / 开放岛 / 吧岛与碰撞，第 3 步 Trae 25 工位与 1,375 路线回归，第 4 步 Codex 样板接线、机位与性能验收。

## 分支

从 `integration/office-evidence-20261023` @ `345cd39` 新建 `feat/v3-align`，**先 merge** `fix/v3-region-focus` @ `4277ee4`（V3-F1，已通过复审；新布局的机位依赖其 `regionFocusOf`），再开始本卡。只追加提交，不 force push、不推 `main`。

## 关键约束：并行变体，现有 V3 不变

4 步完成前，现有 `?layout=3`（含 `officeSample=1`）的画面、工位、导航、测试**必须完全不变**。因此：

- 在 `office-layout.js` 新增独立数据 `LAYOUT_V3_ALIGN`（`version: 3`，另加 `variant: 'align'`），从 `V3_LAYOUT` 复制后按方案甲修改，**不改 `V3_LAYOUT` / `LAYOUT_V3` 本身**；
- `resolveOfficeLayout`：仅当 `layout=3` 与 `align=1` **各恰好出现一次**时返回 `LAYOUT_V3_ALIGN`；其他情况行为与现在逐字相同；
- 不改 `app.js`、导演、家具、样板（这些由后续步骤处理）；本卡只交数据、门洞、路线图与测试。

## 前置修正（审阅 V3-L1-R3 发现，须在本卡落实）

1. **L3-01（P1）决策室门**：board 南门外仅 0.5 m 夹缝（评审室 A 北墙 `z = -11.5`）。改为**东门**（`x = -8.5` 一侧，门中心 z 取 `-15` 左右），门外为北侧缓冲区，接入环路。
2. **L3-02** 四角展示室 `market / service / aftersales / marketing` 补门洞；门外直行净空 ≥ 1.2 m，不得朝向 0.5 m 夹缝（market 与 plan B 之间、board 与 review A 之间）。
3. **L3-03** 方案文档与 SVG：画出全部门洞；修正区域标签被工位点遮挡、图例被裁切；方案 JSON 与 `LAYOUT_V3_ALIGN` 数据一致（以代码数据为准，JSON 由脚本导出或测试比对）。

## 要做

1. **布局数据 `LAYOUT_V3_ALIGN`**（按方案甲 JSON）：
   - 区域：四角展示室；board / review A / plan B 三间独立房间及门洞；`west-open`（`-28..-8.5, -4.5..5.5`，ops 与 quality 为桌组，不是房间）；右侧 kb / product / eng、drlife；creative / dining / leisure 展示区；前厅、广场；
   - 25 个真实工位新坐标与朝向（ID 与绑定不变）；12 个展示席；会议席 14 个（A 8、B 6）的座位点；
   - 吧台岛：`counterRadius 3.5`、碰撞外沿 `6`、吧凳 / 沙发 `4.2 / 5.8`、环路 `6..10`（本步只写数据，几何与碰撞由第 2 步 Codex 实现）；
   - `meetingAccess`、`regionFocus`（每个分区焦点落在新区域内；工具栏 8 个分区 id 与 `meet` 别名都要有）、`miniBounds` 等现有字段按新格局更新。
2. **路线图**：`office-v3-public-path.js` 若依赖固定坐标，改为由布局数据驱动；对 `LAYOUT_V3_ALIGN` 生成公共通道图。
3. **测试 `tests/office-v3-align-data.test.mjs`**（不启动浏览器）：
   - 区域两两零重叠；25 个工位各恰好落在一个 `open` 区域，ID 与 `LAYOUT_V3.seats` 一一对应；12 个展示席在四角；会议席总数 14；
   - west-open 面积 ≥ 140 m² 且最短边 ≥ 10 m；
   - **每个门外直行净空 ≥ 1.2 m**（沿门外法线到第一个房间 / 展示室或场地边界），包括 board 东门与四角展示室门；
   - 路线图连通：从入口经前厅、环路，能到达每个门、每个工位、每个会议席、休息区；
   - `regionFocusOf(LAYOUT_V3_ALIGN, id)` 对工具栏分区与 `meet / plaza / foyer` 都落在场地内（广场在圆内）；
   - **回归**：`LAYOUT_V3`、`LAYOUT_V2`、`LAYOUT_V1` 与 `resolveOfficeLayout` 在不带 `align=1` 时与改动前逐字段相同；现有 `office-v3-meeting-navigation`（FIX3）全部仍通过。
4. 更新方案自检脚本，使其改为读取 `LAYOUT_V3_ALIGN`（或比对 JSON 与之一致），并加入门外净空检查。

## 不做

不改 `app.js`、`director.js`、家具 / 外壳 / 样板 / 吧台几何与碰撞；不改现有 `LAYOUT_V3` 数据；不跑也不改 1,375 条路线的 FIX3 断言以适配新布局（第 3 步）；不合并 main、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送 `feat/v3-align` 后把完整 SHA 告诉派发人。
- 报告 `dispatch/trae/outbox/V3-A1-report.md`：做到 / 没做到 / 未验证；L3-01～L3-03 的处理；新数据与方案 JSON 的一致性证明；新测试与现有 office 测试真实输出末尾；回归（`LAYOUT_V3` 不变）证明。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-data.test.mjs tests/office-*.test.mjs`；全量仅在空闲内存充足时运行，失败按名称与 `345cd39`（合入 V3-F1 后）比较，不得新增。
- 完成后停下，等待 Q-V1 复审；第 2 步卡在本卡通过后另发给 Codex。
