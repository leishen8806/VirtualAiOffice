# D-V2-C1 交付报告（harness → 派发人，待 Q-V1 复审）

- 源码分支：`vis-align/console-v1` @ **`05ff02e74e0c34e25bb8035a3bf50ae810d35584`**
- 证据分支：`evidence/vis-align-console-v1` @ **`302fd21272123738574b359c1d35f07b18cc080b`**
- 基线：`9b783e6e0e868a935485b829fc58a821961786ac`（追加 1 个提交，未改写历史、未 force push）

## 改动文件

| 文件 | 变更 |
|---|---|
| `office3d/dr-console.html` | 5 个 `.camera-*` 改用新 jpg + `cover`；文案「模拟占位」→「设计参考 · 非实时」 |
| `office3d/assets/demo/dr-cam-{site,d1,d3,entry,w1}.jpg` | 新增（从参考整图裁剪，JPEG q92） |
| `office3d/assets/demo/dr-cam-{overview,d1,d3,entry,w1}.webp` | 删除（不再引用） |
| `office3d/assets/demo/INDEX.json` | 5 个新文件逐个登记 source/crop/size/usage/sha256 |
| `office3d/tests/dr-console-static.test.mjs` | 断言 5 个 camera 背景不同文件、INDEX 哈希一致且不等于剖面图、覆盖全部文件 |
| `office3d/tests/dr-console-layout.test.mjs` | 新增像素比对 + 五窗口尺寸/背景验收 |

## 五个文件裁剪与哈希

| 槽位 | 裁剪框 [x0,y0,x1,y1] | 尺寸 | SHA-256（前 16） |
|---|---|---|---|
| `dr-cam-site.jpg`（园区实景） | `[1416,534,1660,643]` | 244×109 | `1f4191d132ab4e2a` |
| `dr-cam-d1.jpg`（D1 月台） | `[1392,708,1516,768]` | 124×60 | `29aa049b01af0d14` |
| `dr-cam-d3.jpg`（D3 月台） | `[1528,708,1652,768]` | 124×60 | `4ba342cc9b8ac741` |
| `dr-cam-entry.jpg`（园区入口） | `[1392,802,1516,872]` | 124×70 | `907728692b4552f1` |
| `dr-cam-w1.jpg`（W1 存储区） | `[1528,802,1652,872]` | 124×70 | `41afb17930c8a6fb` |

（完整 SHA-256 见 `assets/demo/INDEX.json`。）

## 像素比对结果（浏览器 canvas，按 INDEX crop 从整图重裁 vs 文件）

| 槽位 | 平均绝对差 | 平移 4px 后 | 结论 |
|---|---|---|---|
| site | 1.98 | 23.32 | <4 且平移后明显变大 ✓ |
| d1 | 1.86 | 35.58 | ✓ |
| d3 | 2.43 | 35.70 | ✓ |
| entry | 2.03 | 28.35 | ✓ |
| w1 | 3.42 | 46.15 | ✓ |

五窗口在 1920/1366/1024/600/390 五视口下均为非零尺寸、计算 `background-image` 指向正确 jpg（`cover; center`）。

## 测试

- 定向 `dr-console-static` + `dr-console-layout`：**9/9 通过**（static 6 + layout 3，含 Playwright 像素/几何验收，非 NOT_RUN）。
- 全量：本轮未跑（内存/时间，卡标注仅在内存充足时运行）。

## 做到

1. 按表裁出 5 个文件（JPEG q92，未缩放未改色，未插值增强）。
2. 5 个 `.camera-*` 改用新文件 + cover；旧 5 个 `dr-cam-*.webp` 删除；INDEX 登记。
3. 文案改为「设计参考 · 非实时」。
4. 静态 + 像素比对测试，像素 MAD 全部 <4 且平移后明显变大。

## 未验证（需 Q-V1 目视）

1. 监控小图放大后偏软（素材限制，源图仅约 124px 宽）——MAD 达标证明位置正确，但视觉清晰度为素材客观限制。

## 位置

本报告在源码分支 `dispatch/deepseek/outbox/D-V2-C1-report.md`。
