# D-V1-R2 交付报告（harness → 派发人，待 Q-V1 复审）

- 源码分支：`vis-align/console-v1` @ **`f4a3f36a6b94aa2705aa5f0dfc845bcefdda2b4c`**
- 证据分支：`evidence/vis-align-console-v1` @ **`47d056a12784e02e299d1a9d85268fed73b98a45`**
- 基线：`36c646b88cb81b11f8ce433a0bec9ce76f218084`（在其上追加 `6283514`、`f4a3f36`，未改写历史、未 force push）

## 改动文件清单

| 文件 | 变更 |
|---|---|
| `office3d/assets/demo/dr-campus-hero.jpg` | 重裁：`[125,150,1672,652]` → 1547×502（Q-V1 建议框） |
| `office3d/assets/demo/INDEX.json` | `dr-campus-hero.jpg` 的 crop/size/sha256 同步 |
| `office3d/dr-console.html` | 热点框重标定（桌面+移动两组）；移动端 panorama `background-position:left center` |
| `office3d/dr-console.js` | 第 128 行注释改为与实际一致（dr-campus-hero.jpg） |
| （测试）`office3d/tests/dr-console-static.test.mjs` | 上一轮已改内容断言，本轮未回退，仍 5/5 |

## 新裁剪框与取舍

- 裁剪框 `[125,150,1672,652]`（源 `dr-campus-reference.jpg` 1672×941），输出 1547×502，宽高比 3.08，接近 1920 主图容器 1900×570。含 W1/W2/W3 标题牌、W3 厂房与 D1–D6 月台、底部招牌（按 Q-V1 建议整框，未再自行收边）。
- 取舍：右侧「物流网络 / 园区实景」两面板随框裁入。桌面（≥768）由页面同位置 HTML 面板盖住；移动端（<768）panorama 高度受限为 250px、`background-size:cover`，把 `background-position` 由 `center` 改为 `left center`，使显示窗口左移、裁掉右侧被裁入的面板区域，避免从下方 HTML 面板外露出（右侧面板在裁图约 x 73%–100%，左对齐后移动端显示 x 0–76%）。

## 新热点坐标（`%`，相对 hero）

| 分区 | left | top | width | height |
|---|---|---|---|---|
| W1 | 13% | 22% | 21% | 44%（移动端高 18%） |
| W2 | 36% | 22% | 21% | 44%（移动端高 18%） |
| W3 | 60% | 22% | 20% | 44%（移动端高 18%） |

（W3 由 54% 右移到 60%，落在右侧 W3 厂房带；精确落点见「未验证」。）

## 测试

- 定向：`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/dr-console-static.test.mjs` → `# pass 5 / # fail 0`。
- 全量（`--test-concurrency=1`）：
  - 36c646b：`# tests 1222 / pass 1164 / fail 41 / cancelled 16 / skipped 1`
  - 本次 f4a3f36：`# tests 1222 / pass 1164 / fail 41 / cancelled 16 / skipped 1`
  - 失败按名称 diff：**新增 0 / 消失 0**（not-ok 各 57 条逐条一致）。

## 浏览器实测（真实 Chromium 156.0.8078.47，DPR=1，静态服务）

| 分辨率 | KPI | 底部面板 | 横向溢出 | 控制台错误 |
|---|---|---|---|---|
| 1920×1080 / 1366×768 / 1024×768 / 600×900 / 390×844 | 8 | 5 | 0 | 0 |

- KPI 连续 50 次重绘恒为 8；启停动态 5 轮 DOM 节点 428→428 不增长。
- 请求仅静态 GET，0 业务请求、0 外部请求。

## 做到

1. 主图按 Q-V1 建议框 `[125,150,1672,652]` 重裁并落地；INDEX 同步 crop/size/sha256；注释改正确。
2. W1/W2/W3 热点框（桌面+移动）重标定。
3. 移动端右面板露出风险做了 `left center` 处理并写取舍。
4. 定向/全量测试与失败集 diff（0 新增/0 消失）。
5. 证据截图在本次 SHA 上重新采集（全页 5 分辨率 + 热点全亮 3 分辨率 + 并排对照）。

## 没做到

- 实景窗与 4 个监控窗未改（仍占位，符合本轮「不做」）。

## 未验证（需 Q-V1 目视）

1. **热点框精确落点**：W1/W2/W3 百分比为按「左/中/右建筑带 + Q-V1 提示 W3 在 x 1150–1672」的估算，未做像素级标定；`W3 落在 W3 厂房上` 请从证据分支 `hotspots-1920x1080.png` 目视确认，偏差请给具体 px。
2. 标题牌/月台/招牌是否完整：按整框裁切，未目视确认各要素完整。
3. 1366/1024/600/390 下右侧面板是否仍有点状露出：结构测量（HTML 面板覆盖 hero 右 73%–100%）满足，视觉「露出」未确认。

## 位置说明

本报告提交在源码分支 `vis-align/console-v1` 的 `dispatch/deepseek/outbox/D-V1-R2-report.md`。
