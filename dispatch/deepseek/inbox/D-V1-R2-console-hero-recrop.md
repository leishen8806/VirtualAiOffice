---
id: D-V1-R2
base: vis-align/console-v1 @ 36c646b88cb81b11f8ce433a0bec9ce76f218084
branch: vis-align/console-v1
evidence: evidence/vis-align-console-v1
scope:
  - office3d/dr-console.html
  - office3d/dr-console.js
  - office3d/tests/dr-console-static.test.mjs
  - office3d/assets/demo/INDEX.json
  - office3d/assets/demo/dr-campus-hero.jpg
budget: 2h
---
# D-V1-R2：二维中控台主图重新裁剪 + 重标热点

在 `vis-align/console-v1` 上从 `36c646b` **继续追加提交**，不改写已审提交、不 force push。证据继续放孤立分支 `evidence/vis-align-console-v1`，不进源码历史。

## Q-V1 复审结论（36c646b）

- **代码检查：通过。** 窄屏与桌面共用主图、按 SHA-256 断言的资产索引测试都保留，不要回退。定向 5/5；全量 1222 项、19 失败，与 `79b3f1a` 同一批。
- **视觉样板：未通过。** 主图内容已正确（审查员按 INDEX 的 crop 从整图重裁逐像素比对，来源属实），但裁剪框 `[128,235,1338,627]`（x0,y0,x1,y1）切错：
  1. 上边 y=235 切在 W1、W2 标题牌中间（参考图中标题牌约在 y 185–270），画面顶边只剩半截文字和面积牌；
  2. 右边 x=1338 裁掉了 W3 标题牌、W3 厂房和 D1–D6 月台（参考图中约 x 1150–1672），三大分区缺一；
  3. 下边 y=627 截断"DR 智慧仓配服务中心"招牌；
  4. 1920×1080 下 W3 热点框（约 `[1245,357,608,228]` px）落在出库通道路面上，不在 W3 厂房上；
  5. 裁剪只有 1210 px 宽，1920 下放大 1.57 倍，偏软；1024×768 下 cover 再裁掉左右各约 131 px，W3 完全消失。
- 你们证据分支里的 `side-by-side-1920-vs-reference.png` 就能直接看到上述差别。

## 要做

1. 以 `office3d/assets/demo/dr-campus-reference.jpg`（1672×941，SHA-256 `950d40ab…5b61e`）的主图区为准重新裁剪。参考图主图区在 KPI 行之下、底部五栏之上，建议裁剪框约 `[125,150,1672,652]`（约 1547×502，宽高比约 3.08，接近 1920 下主图容器 1900×570）。要求 W1/W2/W3 三块标题牌、W3 厂房与 D1–D6 月台、底部招牌都完整。
2. 参考图右上（物流网络）和右下（园区实景）面板会被一起裁进来。1920 下它们会被页面同位置的面板盖住；必须在 1366×768、1024×768、600×900、390×844 下确认不从页面面板后面露出。若露出，微调右边界或 `background-position`，在报告中写明取舍。
3. 按新裁剪重新标定 `.zoneTarget[data-zone="W1|W2|W3"]` 热点，桌面规则和 `max-width:767px` 两组都要改；W3 必须落在 W3 厂房上。
4. 同步 `assets/demo/INDEX.json` 中 `dr-campus-hero.jpg` 的 `crop`、`size`、`sha256`；现有哈希测试结构不改，只需保证通过。
5. `dr-console.js` 第 128 行注释仍写"园区全景（dr-cam-overview）"，改成与实际一致。

## 不做

不改实景窗和 4 个监控窗（仍为占位，INDEX 已如实标注）；不改 demo 规则、共享模拟、三维、地图投影与地理数据；不下载、不生成新素材，只从仓库里已有的参考整图裁剪；不推 `main`、不 force push、不部署、不启停任何服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后告诉派发人：源码分支完整 SHA、证据分支完整 SHA、改动文件清单与行数。
- 报告 `dispatch/deepseek/outbox/D-V1-R2-report.md`（放在证据分支或工作分支均可，报告里写明位置）：做到 / 没做到 / 未验证；新裁剪框及取舍理由；新热点坐标。
- 截图（放证据分支）：1920×1080、1366×768、1024×768、600×900 全页；1920、1366、1024 下"热点全亮"的主图截图（给三个 `.zoneTarget` 加 `active` 类）；与参考图同比例的并排图。截图必须在本次 SHA 上重新采集。
- 测试：定向 `tests/dr-console-static.test.mjs` 与全量（`--test-concurrency=1`）真实输出末尾；失败按名称与 `36c646b` 比较，不得新增。
- 完成后停下，等待 Q-V1 独立复审；自报通过不算完成。
