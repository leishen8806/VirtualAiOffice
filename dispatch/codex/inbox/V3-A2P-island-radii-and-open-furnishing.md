---
id: V3-A2P
base: integration/office-evidence-20261023 @ 345cd39f7dddebf4e4e61e146af7a283cd415088
branch: feat/v3-align-sample
scope:
  - office3d/office-bar-geometry.js
  - office3d/office-vis2/
  - office3d/office-heart-banyan.js
  - office3d/office-vis2-preview.html
  - office3d/tests/office-vis2.test.mjs
  - office3d/tests/office-v3-align-sample.test.mjs
  - office3d/docs/
  - dispatch/codex/outbox/V3-A2P-report.md
budget: 5h
---
# V3-A2P：格局对齐第 2 步的提前准备——吧台岛半径解耦 + 开放岛陈设组件

## 背景

董事会已批准 V3 格局对齐方案甲（仓库 `plan/v3-layout-align` @ `83ecc1b` 的 `office3d/docs/v3-layout-align-plan.md` 与 `.json`）。实施 4 步：①Trae 新布局数据 / 门洞 / 路线图（卡 V3-A1，进行中，新分支 `feat/v3-align`，新数据为并行变体 `LAYOUT_V3_ALIGN`，仅 `?layout=3&align=1` 启用）→ ②Codex 外壳 / 开放岛 / 吧岛与碰撞 → ③Trae 25 工位与路线回归 → ④Codex 样板接线 / 机位 / 性能。

本卡是 **②的提前准备**：做与布局数据解耦、可独立验证的部分，**不接主场景、不改现有 V3 画面**。V3-A1 通过后，第 2 步只需把本卡成果接到 `LAYOUT_V3_ALIGN`。

从 `integration/office-evidence-20261023` @ `345cd39` 新建分支 `feat/v3-align-sample`；只追加提交，不 force push、不推 `main`、不合并 `feat/v3-align`（汇合在第 2 步做）。

## A. 吧台岛半径解耦（服务台 / 碰撞 / 座位环分开读取）

现状：`LAYOUT_V3` 已有 `island: { center, radius: 6, diameter: 12, treeRadius: 1.2, barOuter: 3.5, stoolRadius: 4.2, sofaOuter: 5.8 }`，`bar: { radius: 3.5, gaps: 东西各 1.5 m }`。`office-bar-geometry.js` 的 `barSpec` 以 `bar.radius` 作为碰撞外沿，`office-vis2/bar.js` 又以同一个 `bar.radius`（`original.radius`）作为**服务台台身半径**。方案甲要把碰撞外沿改为 6（`bar.radius: 6`），服务台保持 3.5——按现有代码，服务台会被画成直径 12 m。

要做：
1. `barSpec` 同时返回 `counterRadius`（取 `island.barOuter`，缺失时回退 `bar.radius`）与 `collisionRadius`（取 `bar.radius`）；`barColliders`、东西开口位置用 `collisionRadius`；
2. `office-vis2/bar.js` 的台身、台面、内弧、柜门缝等一律用 `counterRadius`；吧凳环用 `island.stoolRadius`、沙发环用 `island.sofaOuter`（缺失时用现有常量）；若布局提供 `bar.seats`，视觉座位与之对齐；
3. 东西开口在 `collisionRadius` 处宽度 ≥ 1.5 m；树池（`treeRadius`）与榕树不受影响；
4. **字段名沿用现有 `island.*` 与 `bar.*`，不新起名**（已同步告知 Trae 在 V3-A1 中使用同样的字段名）。

验收：
- 对**当前 `LAYOUT_V3`**：吧台、榕树、`barColliders` 输出的几何数组与 `345cd39` **逐字节相同**（测试比对位置、法线、颜色、索引的哈希），O-06 FIX3 `office-v3-meeting-navigation` 全部仍通过；
- 对一个测试夹具（`LAYOUT_V3` 复制后改 `bar.radius = 6`、`island.barOuter = 3.5`）：台身外沿 = 3.5、碰撞外沿 = 6、东西开口 ≥ 1.5 m、吧凳 / 沙发在 4.2 / 5.8；
- 预览页 `office-vis2-preview.html?islandFixture=align` 用该夹具渲染（仅预览，不进主场景）。

## B. 开放岛陈设组件（不算工位）

方案甲左侧 `west-open`（`-28..-8.5, -4.5..5.5`，195 m²）只有 6 个真实工位，建成后可能显得空。参考图（仓库 `main` 分支 `docs/visuals/target-office.png`）开放办公区是成组桌岛、矮柜与绿植。

要做：
1. 新私有模块（如 `office-vis2/open-furnishing.js`）：共享长桌、矮储物柜、绿植岛、矮隔断（≤ 1.2 m）四类组件，确定性生成、合入现有材质批次（不新增独立绘制调用超过 2 个）、低档减面；
2. 输入：一个开放区外框 + 已有真实工位点（避让半径）+ 必须保留的通道（≥ 1.2 m）；输出：组件几何与**占地 / 碰撞盒清单**（供 Trae 在第 3 步注册碰撞，本卡不注册）；
3. 预览：在预览页用方案甲 `west-open` 外框与 6 个工位点（取自方案 JSON）摆一版，展示密度效果。

验收：
- 组件占地互不重叠、不压真实工位（≥ 0.6 m 避让）、保留 ≥ 1.2 m 通道（测试断言）；
- 高档三角形 ≤ 8,000、新增绘制调用 ≤ 2；低档三角形少于高档；
- 不新增动画循环、不下载素材、不读取业务数据。

## 不做

不改 `office-layout.js`、`LAYOUT_V3` / `LAYOUT_V3_ALIGN` 数据、`app.js`、导航与导演、工位与业务映射；不接入主场景（`officeSample=1` 下现有画面必须不变）；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送 `feat/v3-align-sample` 后把完整 SHA 告诉派发人。
- 报告 `dispatch/codex/outbox/V3-A2P-report.md`：做到 / 没做到 / 未验证；A 的逐字节一致性证明与夹具验收数值；B 的组件清单、占地与通道断言、性能数值；预览截图（取证不读真实运营数据：静态服务 + `/state` 空夹具）。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs`；全量仅在空闲内存充足时运行，失败按名称与 `345cd39` 比较，不得新增。
- 完成后停下，等待 Q-V1 复审。
