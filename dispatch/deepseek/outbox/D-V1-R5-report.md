# D-V1-R5 交付报告（harness → 派发人，待 Q-V1 复审）

- 源码分支：`vis-align/console-v1` @ **`8dfb30ccdfc29d26b4398acb4ef593a4112839f5`**
- 证据分支：`evidence/vis-align-console-v1` @ **`f727aead5c5b030cf5c4aab20b16d9c4234fc16f`**
- 基线：`5a12251505f8661830e6a9abe8cbb7b9ed70e6d6`（追加 1 个提交，未改写历史、未 force push）

## 改动文件

| 文件 | 变更 |
|---|---|
| `office3d/dr-console.html` | 网络面板 DOM 移出 `.hero`（放到 hero 之后、panels 之前）；dashboard 网格改两列 `minmax(0,1fr) 24%` + 各行显式放置；`.networkPanel` 改 `grid-column:2; grid-row:2/span 2; min-height:0`；1024 段 `.panorama` 规则移到 `min-width:768px` 块之后 |
| `office3d/tests/dr-console-static.test.mjs` | 更新为 R5 静态断言（面板不在 hero 内、1024 规则顺序、网格两列） |
| `office3d/tests/dr-console-layout.test.mjs` | 新增 Playwright 几何验收（无浏览器时 skip=NOT_RUN） |

## 布局实现方式（董事会方案 A）

采用**网格跨行**：`.dashboard` 两列（左 76% / 右 24%）。`.top`/`.hero`/`.panels` 占满两列；`.kpis` 在第 1 列第 2 行；`.networkPanel` 在第 2 列、跨第 2–3 行（KPI 行 + hero 行），`align-self:start` + 显式高度（≥1600 为 `calc(104*--screen-unit + 116px)`，≤1599 为 `170px`），故面板顶部与 KPI 顶部对齐、向下延伸覆盖主图区顶部约 18–20%，且不再压 W3 标题牌。

## 几何验收实测（全部数值，坐标以 `.hero` 包围盒为 100%）

| 项 | 1920×1080 | 1366×768 | 1024×768 |
|---|---|---|---|
| networkPanel 与 W3 标题牌区域相交面积 | **0**（面板底≈19%） | **0**（≈18%） | **0**（≈18%） |
| networkPanel 不是 `.hero` 后代 | 是 | 是 | 是 |
| KPI 右缘 → 面板左缘间距 | 8 px | 8 px | 8 px |
| 地图 SVG 高度 | 174 px | 124 px | 124 px |
| 地图城市标签字号 | 15 px | 15 px | 15 px |
| `.panorama` background-position-x | 50% | 50% | 0% |
| W1 标题牌被 `aside` 覆盖 | <50% | <50% | <50% |
| KPI 数量 / 横向溢出 | 8 / 0 | 8 / 0 | 8 / 0 |

600×900、390×844：`.panorama` background-position-x = **−62px**（左缘无参考图菜单）；`.networkPanel` 在主图下方（top 1024.5 > hero bottom 1015.5）。

## 测试

- 定向：`dr-console-static.test.mjs` + `dr-console-layout.test.mjs` = **7/7 通过**（含 Playwright 几何验收，非 NOT_RUN）。
- 全量（`--test-concurrency=1`，带 `--max-old-space-size=2048`）：`1166 pass / 41 fail / 16 cancel / 1 skip`，与 `5a12251` 失败名称 diff **0 新增 / 0 消失**。

## 做到

1. 面板移出主图、放到 KPI 行右侧（网格跨行，方案 A）。
2. 1024 段规则移到 `min-width:768px` 块之后，实测 `background-position-x` = 0%。
3. 静态 + 几何验收测试，几何验收全部数值通过。

## 未验证（需 Q-V1 目视）

1. 地图城市名（金边等）在 1920/1366 下是否「清晰可读」——几何字号 15px 达标，但「可读」是视觉判定。
2. W3 标题牌「完整可见」、W1 标题牌是否被侧栏遮挡——几何上相交面积 0、覆盖 <50% 达标，视觉完整度未目视。
3. 1366/1024 下 8 张 KPI 卡在 76% 宽内是否文字被截断——`overflowX=0`、卡片 8 个达标，但「文字不被截断」需目视（`.label`/`.value` 有 `text-overflow:ellipsis`）。

## 位置

本报告在源码分支 `dispatch/deepseek/outbox/D-V1-R5-report.md`。
