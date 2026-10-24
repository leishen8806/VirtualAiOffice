# D-V1-R6 交付报告（harness → 派发人，待 Q-V1 复审）

- 源码分支：`vis-align/console-v1` @ **`33ca2eb3dc915fecb79646894611fb94a5eb4df8`**
- 证据分支：`evidence/vis-align-console-v1` @ **`6001243e6440d8d7fe0b6db7e514c3a297e828d1`**
- 基线：`129727500b9434cfb3b9224b80fa1c758ea3963b`（追加 1 个提交，未改写历史、未 force push）

## 改动文件

| 文件 | 变更 |
|---|---|
| `office3d/dr-console.html` | 窄屏 `.sitePanel` 改整行（`left:0;width:100%`）；≤1599 `.sub` 允许两行、字号 .64em→.58em |
| `office3d/tests/dr-console-layout.test.mjs` | 新增 R6 三条回归断言（窄屏无空洞、hero 底边、1366 副标题不截断） |

## 窄屏方案取舍（选 A）

选 **A**：园区实景面板（`.sitePanel`）在 <768 改为整行、覆盖主图下方整个区域（原为右下 38% 宽，左下留灰色空洞），物流网络面板保持在主图下方整行。理由：网络面板 DOM 已按 R5 移出 `.hero`，方案 B 需再把它塞回主图内，会与桌面结构冲突；方案 A 只改 `.sitePanel` 一处，去掉空洞且不破坏桌面。

## 新断言在 1297275 与新代码的两次输出

- `1297275`（基线）：`not ok 2 - 600x900 园区实景面板应覆盖整行（无空洞）`（失败，证明空洞存在）。
- 新代码 `33ca2eb`：`# pass 2 / fail 0`（R5 几何验收 + R6 回归全过）。

## 测试

- 定向 `dr-console-static` + `dr-console-layout`：**8/8 通过**（static 6 + layout 2，含 Playwright 几何/回归，非 NOT_RUN）。
- 全量：本轮未跑（R6 仅 CSS+测试，卡标注全量仅在内存充足时运行）；如需要可补跑。

## 做到

1. 窄屏主图下方空洞消除（园区实景整行覆盖）。
2. 1366 KPI 副标题不截断（允许两行 + 缩小字号）。
3. 三条回归断言，且在 1297275 上确认失败、新代码上通过。

## 未验证（需 Q-V1 目视）

1. 窄屏园区实景整行后的视觉比例、1366 KPI 副标题两行的可读性——几何断言通过（无 50×50 空洞、`scrollWidth<=clientWidth`），视觉未目视。

## 位置

本报告在源码分支 `dispatch/deepseek/outbox/D-V1-R6-report.md`。
