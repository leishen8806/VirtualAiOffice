# VIS2-W-B / B1 只读契约审计（FIX1 任务第 7 步；供后续分诊，**本次未改动 B / B1**）

**审计对象：** B 提交 `410707dbd001d443e68db3dd85ee85032838053e`（分支 `vis2w/dispatch-suite-b`）、B1 提交 `f9d296ef5afeae3971a0ab22a65339c18e1c2332`（分支 `vis2w/dispatch-suite-b1`）。方法：读源码 + 对照 `office-layout.js` 的 `CAMPUS_WALKABLE` / `CAMPUS_ZONES` 与旧模块；**没有渲染、没有改任何文件**。以下每条都标明证据与建议负责方；严重度按「接入前是否必须修」。

| # | 级别 | 类别 | 发现 | 证据 | 建议 |
|---|---|---|---|---|---|
| 1 | **P1** | 入口与墙体对齐 | **中控室南墙的玻璃把服务通道堵死了。** 南墙门洞我假定在 x −159.9…−157.9（`eastX − 5.6 … − 3.6`），但布局里的步行通道 `serviceAxis` 是 x −166…−160、z 10…25，它是从南侧进入中控区的路径；南墙西段玻璃（x −167.65…−159.9，z 15.7）正好横在这条通道上。门洞在通道的东侧约 0.1–2 m 之外，**与通道没有重叠** | `dr-vis2-dispatch-suite.js`：`frame(wallX + 0.1, zMax, eastX - 5.6, zMax)`；`office-layout.js`：`CAMPUS_WALKABLE.serviceAxis` | 门洞挪到 x −166…−160（宽 ≥ 1.5 m）；并与 Trae 的外壳真实门洞对齐后再定。负责：构件作者（B） |
| 2 | **P1** | 竖向基准 | B / B1 与 A 有**同样的竖向基准问题**：所有家具、墙、玻璃、屏幕都从 y = 0 起算，没有 `baseY` 参数；而 `dr-campus-shell.js` 的建筑地面平面在 y = −0.54，各旧模块的家具也从 y = 0 起算，真实完成面标高未确认 | 构件内所有 `box(...)` 的 y；`dr-campus-shell.js:68` 的 `part.offset - .6` | 与 A 一样加 `baseY`（整个 group 放在 baseY 上），由集成方 / 董事会确认标高后传入；**不要**自行编造 |
| 3 | P2 | 公共步行区与家具 | 接待与展示家具落在布局的步行区内：接待台（z 23.8…24.6）压进 `visitorHall`（z 24…30）约 0.6 m；两张沙发（z ≈ 27.8）在 `visitorHall` 内；展示台（z 24.35…26.05，x −144.5…−139.5）在 `showcaseHall`（x −154…−104，z 24…28）内，只剩约 0.35 m + 1.95 m 的通行宽度 | `CAMPUS_WALKABLE.visitorHall / showcaseHall` 对照 B 里 `deskRZ = visitor.z0 + 4.2`、`tableZ = showcase.z0 + 5.2` | 与 Trae 的路径 / 客户动线（`CAMPUS_FLOWS.customer`）一起核对；必要时把家具推出步行带或把步行带改为绕行。负责：集成方 + 构件作者 |
| 4 | P2 | 快照版本语义 | `update(next)` 只比较 `generatedAt`：**缺 `generatedAt` 的快照永远视为新版本**（`nextVersion !== null && === version` 对 `null` 恒为假），宿主若每帧调用就会每帧重绘并上传两张纹理；反过来，**同一个 `generatedAt` 但内容不同的快照会被忽略** | `update`：`if (nextVersion !== null && nextVersion === version) return false` | 文档写明版本必须由宿主给出且随内容变化；或对缺版本的快照做内容哈希。负责：构件作者 |
| 5 | P2 | `canvasTex` 与纹理所有权 | 构件要求宿主的 `canvasTex(w,h,draw)` 返回带 `image.getContext('2d')` 的纹理（更新时靠它重绘）；`dispose()` 对 4 张纹理调用了 `dispose?.()`。若宿主（`app.js` 的 `canvasTex`）自己也登记并释放这些纹理，会**重复释放**；若宿主返回的纹理没有 `image.getContext`，`update` 会**静默什么也不做**（返回 `true` 但没有重绘） | `redraw()`：`texture.image?.getContext?.('2d'); if (!ctx) continue` | 接线前核对真实 `canvasTex` 的返回值与释放责任；`update` 在无法重绘时应返回 `false`。负责：集成方 + 构件作者 |
| 6 | P2 | 共享几何替换 | 旧 `campus-dispatch-simulation` 是**一个合并网格**，同时含中控后墙屏与服务中心展示墙的大黑屏；B 的替换清单要求「整体停用」，但这会同时去掉旧模块里可能还想保留的其它屏；旧模块没有「只去其中一块」的选项 | `dr-campus-interior.js:253-257`（两个 `quad` 合并成一个 `screen`） | 集成方在旧模块里增加按块跳过的选项（共享文件改动，需批准）。负责：集成方 + 董事会 |
| 7 | P2 | 图像所有权与回退 | 图片由宿主加载并传入，构件**不持有也不释放**图片（只在 `logo` 闭包里引用）；图片未解码完成（`naturalWidth = 0`）时 `containRect` 返回 `null`，**静默画占位标识**，宿主必须在 `onload` 后调用 `setLogo`；跨域图片未设 CORS 会让画布被污染、纹理上传抛 `SecurityError`（当前素材同源，不会触发） | `drawBrandAtlas` / `containRect` / `setLogo` | 文档补充：先加载再传入；`setLogo` 在重绘失败时应返回 `false` 并保留旧画面。负责：构件作者 |
| 8 | P2 | 文档过度宣称 | B 文档第六节写「热点**不需要重映射**」——与 A 同样是因为现在没有热点才成立；且 `vis2b-glass / glow / gold` 以外的批次会被 registry 合并，**合并后这些对象名不可用于拾取** | `docs/dr-vis2-dispatch-suite.md` 第六节；`mergeCampusStatic` | 改文案，区分「逻辑区域 ID（稳定）」与「渲染对象名（合并后不存在）」。负责：构件作者 |
| 9 | P2 | 自报预算为常量 | B 的 `summary().drawCalls` 是硬编码常量（9 / 11），不是由场景图数出来的（A 的审查员已指出同类问题） | `summary()`：`drawCalls: 11` | 改为遍历场景图计数，并写明只代表组件预览。负责：构件作者 |
| 10 | P2 | 画质契约 | B 的网格**没有设 `qualityProxy`**，会被 `quality.js` 的 `capture()` 登记并在低画质下换材质、进阴影表；`dispose()` 之后这些表仍引用已释放对象 | `quality.js:157` 对照 B 的各 `Mesh` | 按 A 的做法设置并补测试。负责：构件作者 |
| 11 | P3 | 材质被统一 | 轻金属批次靠 `dynamic` 才避开合并；其余 `structure` 批次（含木色、石材、座椅）合并后统一为 roughness .72 / metalness .18、不投阴影 | `mergeCampusStatic` | 文档说明；接入后复测观感 |
| 12 | P3 | 测试的循环论证 | B 的区域边界测试读的是构件自己记录的 `regions`（构造时累计的范围），不是从真实几何读取；桌面屏「面朝东」没有测试，只在截图里看过 | `tests/dr-vis2-dispatch-suite.test.mjs` 的 zone 测试 | 改用真实包围盒与屏幕法线断言 |

**结论：** B / B1 **不应进入集成**，至少先处理第 1、2 条（入口对不上通道、竖向基准）。第 3 条需要与 Trae 的客户动线一起核对。以上均为**只读审计**，没有改动 B / B1 的任何文件，也没有重新渲染验证。
