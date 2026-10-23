# VIS3-M1-FIX1 实施与验收记录

状态：**READY_FOR_INTEGRATION_REVIEW，非 ACCEPTED**。提交 SHA 以本记录所在提交为准；原始评审提交 `991dd49b13a99dc856f9061673fad2875b76cacf` 保留。独立 Opus 复核尚未执行。

## 本次修改

- O-01：吧台标识背板与画面贴片按真实吧台半径制作弧面，采样中心与两端离台身均有正净距，背板顶低于金属收边。沿用 `assets/logo.png`，全体标识仍合计 2 个私有绘制调用。
- O-02：新增弧面净距、收边、实际前台背景、共享／私有资源、可见／隐藏多材质模型、重复进入退出测试。原有 25 个真实工位坐标与 ID 未改。
- O-03：前厅导向字牌提高并移到背景面外侧，几何断言覆盖字牌与品牌背景的三维净距。前台和背景墙现有品牌仍可见。
- O-04：逐项读取文件验证 `MANIFEST.json` 记录的 SHA-256；`brand.js`、`frontage.js` 更新，新增 `completion.js`。复核 `floor.js` 与 `foyer.js` 的现存 SHA 均与原清单一致，故未改它们。
- O-05：保留多材质数组，对宿主几何与材质按所有权处理；私有隐藏代理几何释放，宿主模型资源保留。
- O-07：独立预览增加四个角落展示部门的桌椅、架子和绿植，会议房间的边缘屏幕与绿植，创意／餐饮／休闲陈设，以及入口广场铺装、同心圆、花箱和四棵树。外墙暖白只应用于独立预览实例。新模块批合为 1 个家具与广场网格及 1 个标牌网格，不含新动画循环、业务请求或 Agent 工位。

## 浏览器实测

环境：Windows 10，HeadlessChrome 155，1920×1080，DPR 1。经现有 `office.localhost:3200` 同源地址打开，静态资源路由到本 worktree 的待提交文件；没有重启或部署服务。截图均为真实 WebGL 浏览器输出。原评审全景、吧台、前台作为修改前证据；截图含相机状态由 `office-vis2/preview.js` 固定姿态控制。

| 场景 | 修改前 | 修改后 |
|---|---|---|
| 办公室总览 | [原评审总览](FIX1-evidence/before-office-overview.png) | [当前总览](FIX1-evidence/after-office-overview.png) |
| 吧台标识 | [原评审吧台](FIX1-evidence/before-bar-brand.png) | [当前正面](FIX1-evidence/after-barBrand.png)、[斜视](FIX1-evidence/after-bar.png) |
| 前台与背景墙 | [原评审前台](FIX1-evidence/before-reception.png) | [当前前台](FIX1-evidence/after-reception.png) |
| 展示部门四角 | — | [市场](FIX1-evidence/after-market.png)、[客服](FIX1-evidence/after-service.png)、[售后](FIX1-evidence/after-aftersales.png)、[营销](FIX1-evidence/after-marketing.png) |
| 会议房间 | — | [评审室](FIX1-evidence/after-meeting-a.png)、[计划室](FIX1-evidence/after-meeting-b.png) |
| 前厅广场 | — | [广场](FIX1-evidence/after-plaza.png) |
| 爱心榕树 | 原模型未改 | [入口正面](FIX1-evidence/after-treeFront.png)、[斜侧](FIX1-evidence/after-treeSide.png) |

整页绘制：高档 `23 calls / 107388 三角形 / 20 几何 / 10 纹理`，低档 `19 calls / 57923 三角形 / 18 几何 / 10 纹理`；固定 1920×1080 取样。高档 120 帧采样中位帧间隔 `16.7 ms`、P95 `16.8 ms`，渲染 CPU 中位 `1.0 ms`、P95 `1.3 ms`；这是当前无真实业务数据的独立预览结果，不能外推生产帧率。进入后连续三轮退出／再进入：退出均 `2 calls / 2 几何 / 3 纹理`，进入均 `23 calls / 21 几何 / 10 纹理`（运行中计数），没有单调增长。另一次页面加载记录 104 个静态 GET、0 个非 GET、0 个 `/api/`、`/state` 或 `/act` 请求。没有批准的整体性能预算，不标记性能 PASS。

## 测试与范围边界

- 定向：`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/office-vis2.test.mjs tests/office-heart-banyan.test.mjs`：**16/16 通过**。
- 全量：相同内存、超时与单并发参数运行 `tests/*.test.mjs`：**1179 项，1161 通过、17 失败、1 跳过**；日志在本机 `E:\VirtualAIOffice\office3d-backup-vis2-o-r3\FIX1-full-test.log`。17 个失败与本 worktree 既有基线的失败数相同，含缺少历史 `office3d-backup-*` 文件和范围外的旧源码快照比较；本次未对原始失败集合逐项差分，不能据数量相同断言集合完全相同。没有放宽断言。
- O-06 仍待 Trae：共享会议桌、六／八席、会议屏与路径必须整体修正；[精确交接](VIS3-M1-FIX1-HANDOFF.md)。本分支不修改共享家具、布局、导航、Paperclip 或仓配。
- 新陈设目前只在独立预览；主场景可见性、人物穿行、热点和真实业务交互仍需 Trae 接线与独立复核。概念图比当前样板更丰富：会议房间和部分建筑细节仍未达到完整视觉验收。未录制视频，FIX1 本次卡要求的截图已提供。

请求独立 Claude Opus 5.5 以本提交全 SHA、本文和 `FIX1-evidence/` 复核：几何净距、资源所有权、四角及广场视觉、共享 O-06 交接。复核完成前不宣称 M1 验收通过，也不开始 M2/M3。
