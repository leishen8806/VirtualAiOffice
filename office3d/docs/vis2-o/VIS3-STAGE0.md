# VIS3-CODEX-001 · Stage 0 基线

日期：2026-10-23。当前只执行 M1；M2/M3 停在独立评审闸门之前。

## 仓库与历史

- 仓库：`git@github.com:leishen8806/VirtualAiOffice.git`。
- 工作树：`E:\VirtualAIOffice\vis2-o-office`，分支 `vis2/o-office-sample`。
- 本轮起点：`eee77accb1270b2dcec2042f84b1ec1dccf5e02e`，远端同 SHA。
- 已执行 `git fetch origin --prune`；保留此前 VIS2-O-R3 的未提交私有改动，未 reset、stash、切换或合并分支。
- 历史提交 `b623556`（样板）、`0f6c14a`（留档）、`f634841`（Logo）、`eee77ac`（指标说明）均为当前祖先。
- 工作树清单已读取并留在本任务外部备份目录的 `worktrees-stage0.txt`；没有修改其他工作树。
- 3200 运行目录与当前 Git 工作树分开，不认定运行服务已部署本候选。

## 可复用实现与归属

| 能力 | 当前实现 | 归属与本轮动作 |
| --- | --- | --- |
| 办公布局与真实工位 | `office-layout.js` 的 LAYOUT_V3、`office-furniture-v2.js` | 读取，保留席位 ID、坐标与 monitorScreenFit，不改布局 |
| 办公外壳、玻璃与墙遮挡 | `office-layout-v3-scene.js`、`office-v3-occlusion.js` | 复用于私有预览，不改共享源码 |
| 环形台、树与前厅 | `office-vis2/`、`office-heart-banyan.js` | 继续私有样板，修 Logo 贴合与生命周期 |
| 办公室注册 | `office-v3-modules.js`、`office-v2-registry.js` | Trae 的共享接线，未修改 |
| 既有家具与资产加载 | `assets3d.js`、现有家具 GLB | 复用加载和摆放契约，不下载、不改加载器 |
| 画质 | `quality.js` | 复用 initialQuality/cappedDpr/renderLimit；实际合批/降档契约加回归验证 |
| 地点导航 | `place-mode.js`、`place-bar.js`、`town.js` | Trae 所有，不修改 |
| DR 园区 | `dr-campus-{registry,modules,shell,racks,interior,motion,shuttle}.js` | M2 只审计，不接线、不重建 |
| 调度台与地图 | `dr-console*.js`、`dr-campus-interior.js` | M3 只审计；当前分支没有 dr-console-runtime.js，不据旧报告假定存在 |
| 业务、认证、公司隔离 | `server.mjs`、Paperclip 与现有操作入口 | 不属于本轮视觉文件，不修改 |

图谱 MCP 工具本会话不可用；调用关系以当前源文件和 Git 对象为准，没有将历史图谱当成最新源码。

## DR 候选核查

`e988a864b1804bc12b9ca8257e1bca156ce55574` 在远端 `integration/vis2-dr-rc1`，提交标题为 `fix(office3d): align VIS2 rack cell to finished floor`。它更新共享契约和三个园区文件，传递 `CAMPUS_FINISHED_FLOOR_Y = .06 - .6 = -0.54` 给货架单元的 `baseY`。这是源码核查，不是浏览器测绘、独立验收、合并或部署证明。本轮没有将它合入办公室分支。

## 参考素材

- 已完整查看 `E:\VirtualAIOffice\knowledge\项目\参考\智序工场-办公区改造概念.png`。
- 已完整查看 `E:\VirtualAIOffice\knowledge\项目\参考\DR智慧仓配中心全景仪表盘6.0.png`。
- 指定的 `智序小镇·DR仓配服务中心概念图(1).png` 未找到；只找到并查看不带 `(1)` 的 `智序小镇·DR仓配服务中心概念图.png`，两者不能未经确认认定完全相同。
- 老任务的 `references/office-target.png`、`references/office-current.png` 仍缺失。
- 已批准的品牌素材 `assets/logo.png` 存在，保持原图比例；外部权属记录未知，不伪造官方新品牌。

## 现存冲突与限制

- 当前真实注册入口仍使用旧 island。私有样板有完整控制器，但未获授权改共享入口；本轮独立预览只复用其几何与家具，正式替换必须由 Trae 去重接线。
- 全量回归在最终私有代码第一次完整运行时为 1176 项：1158 通过、17 失败、1 跳过。失败集中在缺失配置/历史备份/地图夹具及未修改的旧快照断言；没有为得到全绿生成生产配置或放宽断言。
- Obsidian 可访问，Project-Map 未登记 VirtualAiOffice；未借用其他项目记录，也未写长期记忆。
