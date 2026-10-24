# VIS2-W · A：高位货架 + 轨道式托盘穿梭机 + 托盘货物（组件级样板，尚未正式接入）

**状态：** 组件预览与隔离自测完成；**不是仓配验收通过，也不是集成验收**。本文是 **FIX1 修订版**（回应独立审查 `CHANGES_REQUIRED`：对象 `2879124f4f89f64721a0c328bd4d052c25bd6934`）。
**分支：** `vis2w/rack-cell-a-fix1`（基于被审查提交 `2879124…`，不改写该提交）；基线 `cbddb9fa3b874f7f56c8410928a8edd23013795c` 是快照分支，不是 `main`。独立审查员必须复审新提交后才能进入集成。

## 一、交付内容（FIX1 相对 2879124 的变更文件）
`office3d/dr-vis2-rack-cell.js`（重写）、`office3d/dr-vis2-rack-cell-preview.html`（适配新接口）、`office3d/tests/dr-vis2-rack-cell.test.mjs`（重写，18 项）、`office3d/docs/dr-vis2-rack-cell.md`（本文）、`office3d/docs/dr-vis2-bb1-contract-audit.md`（新增：B / B1 的只读契约审计，供后续分诊，**未改动 B / B1**）。
素材：无外部素材、无贴图；全部程序化几何。穿梭机是原创低矮轨道车，不是叉车或载人机器人；`asset-intake/gpt-reference/campus` 的四视图只作外观参考。

## 二、构件接口与配置参数
`buildVis2RackCell({ THREE, root, layout, quality, seed = 4207, rows = null, baseY = 0 })` → `{ group, summary, setShuttle, dispose }`
- `layout`：`{ campus, zones, shuttle }`（来自 `office-layout.js`，只读）。`quality`：`{ tier: 'high' | 'low' }`，**构建时**决定；运行时切换画质需要宿主 `dispose()` 后重建（见第七节）。
- `seed`：确定性随机（货位占用 / 层数 / 缠绕膜）。`rows`：要建的货架行标签数组（如 `['A1','R2']`，默认全部 4 行；传 `[]` 或未知标签得到 0 行，不报错）。
- **`baseY`：完成面地坪标高（米）。** 构件内部所有竖向尺寸（立柱、横梁、托盘、轨道、枕木、车轮、承托板）都以「地坪 = 0」计，整个 `group` 放在 `baseY` 上（`group.position.y = baseY`）。默认 `0` 仅供组件预览/夹具；生产注册路径固定显式传入 `CAMPUS_FINISHED_FLOOR_Y = -0.54`，并在真实 registry 回归中验证。非有限数值会抛错。
- `summary()`：含 `vertical`（`railTop 0.105 / wheelBottom / chassisTop 0.54 / maxLift 0.12 / rackTop 4.4 / topBeam 4.16`，**相对地坪**）、`state`（`source: 'fixture' | 'host'`）、**由真实场景图数出的** `componentPreviewDrawCalls` 与 `triangles`。

## 三、造型与尺寸（米，y 自地坪）
- **货架**（取自 `createCampusRackPlan` 的 A1/R2/C2/B2 与各 6 个货位）：单深选择式，框架进深 1.1 m 居中于 2 m 占地；立柱 0.1×4.4 **#2F6FA8**、横撑 / 斜撑同色；横梁 4 道（0.2 / 1.5 / 2.8 / 4.1）**#E8832A**，**横梁两端各插入立柱 1 cm（无缝）**，第 4 道只作顶梁不放货。每货位两个托盘，约 22% 空位。
- **托盘与货物：** 托盘 1.2×1.0×0.12，搭在两条相距 0.95 m 的横梁上（两端悬出 0.125 m）；纸箱每层 2×2，**间隙 5 mm、不再随机抖动位置**（无穿插），2–3 层，货高 ≤ 0.95 m；约 72% 带半透明缠绕膜。货顶最高 3.93 m，低于顶梁 4.16 m。**修正旧说法：** 货架区上方并没有整片屋面（`dr-campus-shell.js` 的屋面只覆盖南北各 5 m 的带，外墙高 4.5 m）；本构件按「立柱 4.4 m、低于墙高 4.5 m」设计，**没有对着屋面做碰撞核对**。
- **轨道：** 两条钢轨（轨距 1.4 m，位于展示带中线 ±0.7 m），轨顶 **0.105 m**（离地），枕木每 0.8 m 一根，四个端部缓冲块。**修正旧说法：** 车体底面离地 0.26 m，离**轨顶**为 0.155 m。
- **穿梭机（拆成三块，lift 只动承托板）：** `vis2-shuttle-chassis`（车体 1.7×0.28×1.1 m + 四个车轮 + 侧面橙色识别条 + 缓冲；**车轮底面 = 轨顶面，任何 lift 下都不动**）、`vis2-shuttle-platform`（承托板，lift = 0 时底面正好贴车体顶面 0.54 m）、`vis2-shuttle-load`（承托板上的托盘与纸箱，随承托板上升；`carrying = false` 时隐藏）、`vis2-shuttle-lamp`（状态指示灯，颜色由 `status` 决定）。另有 `vis2-slot-pallets`（三个货位的停放托盘，按 `occupied` 显示，位于展示带东侧通道、不压钢轨）。
- **几何质量：** 车体与货物每个面独立顶点、法线精确；车轮侧面法线径向、端盖法线沿轴、缠绕方向统一朝外（有逐三角形测试）。

## 四、宿主状态接口：`setShuttle(next)`（本构件**不**含任何模拟引擎、RAF、定时器或业务状态）
| 字段 | 含义 | 校验 |
|---|---|---|
| `z` | **世界坐标 z**，直接等于 `shuttleFrame(...).position`；夹在轨道行程 `[plan.path.z0, plan.path.z1]`（−6.85…4.85）内 | 非有限数忽略 |
| `lift` | 承托板与货物的抬升，0…0.12（= `SHUTTLE_MAX_LIFT`）；**车体与车轮不动** | 夹紧；非有限数忽略 |
| `carrying` | 是否载货（决定货物是否可见） | 只接受布尔 |
| `occupied` | 三个货位是否有托盘 | 只接受长度 3 的布尔数组 |
| `status` | `idle / moving / pickup / put / delivery`（指示灯颜色）；其它字符串 → 灰色 | 只接受字符串 |
返回 `true` 表示至少一项被采纳。未传的字段保持上一次的值；从未收到宿主状态时显示确定性夹具默认（载货、`occupied = [true, false, true]`、`idle`），`summary().state.source` 为 `fixture`。生产宿主每帧完整转发 `shuttleFrame` 的 `position/lift/carrying/occupied/status`；`campusMotion=0` 时宿主不再推进该状态。
**修正旧文档的错误（P1-1）：** `shuttleFrame.position` 本来就是世界 z（−6.85 / −1 / 4.85），**不是 0…2 的货位序号**，不得再做 `slots[0].z + position × …` 的换算——那会把所有位置夹到两端。测试用真实 `shuttleFrame` 逐帧驱动并验证到达 −1。

## 五、旧对象替换清单与集成决定（属于 Trae 的集成范围，本构件不替代共享地面）
| 旧对象 | 决定 |
|---|---|
| `campus-racks-static`（`dr-campus-racks.js` 的 `buildCampusRacks`） | 停用其中的货架立柱 / 横梁 / 货物箱体，**以及穿梭机展示带的旧底座板（y 0.06…0.18，会把新钢轨与枕木整根埋住）**；该实例化网格还混有工位与月台门，需让旧模块**跳过货架、货物与穿梭机底座并保留其余**，不要整体删除 |
| `campus-shuttle`、`campus-shuttle-static` | 由本构件的 `vis2-shuttle` 与 `vis2-rails` 替换 |
| 货架区功能区体块（`dr-campus-shell.js` 的 `campus-zone-highRack`，y 0.06…0.78；低画质下是**不透明**材质，会遮住车体、轨道、第 1 层横梁与托盘下部） | **改为地面标线 / 贴地标记**，不再用不透明体块；真实地坪保留（不由本构件另铺一层） |
| `campus-rack-labels` | 保留；但上面「穿梭机展示位（预留）」的文案接入后已过时，需改文案 |
| 仍共享 | `CAMPUS_ZONES`、`CAMPUS_SHUTTLE_STRIP`、`createCampusRackPlan`、`shuttlePlan`（只读导入） |
**当前生产接线：** `dr-campus-modules.js` 显式以 `CAMPUS_FINISHED_FLOOR_Y = -0.54` 创建本构件；`dr-campus-racks.js` 在替换模式下仅保留 3 个工位、4 个收货门和 3 个发货门，并同样落在完成面。旧货架、旧轨道与旧车体不会进入合并批次。

## 六、拾取契约（修正 P1-4；本任务**不**新增拾取功能）
- **实例化网格会被 `mergeCampusStatic` 合并并移出场景：** 合并后 `vis2-rack-frames / pallets / cartons / vis2-rails` 与旧的 `campus-racks-static` 都**不存在**（测试在真实 registry 里固定了这一点）；保留独立对象的只有 `vis2-rack-film`、`vis2-shuttle*`、`vis2-slot-pallets`。**因此「渲染对象名」不能当拾取目标，之前「改为指向 `vis2-rack-*`」的说法已撤销。**
- **稳定的是逻辑货位标识**（`createCampusRackPlan` 的 `rack-A1-1…rack-B2-6` 等）：它们只存在于布局数据里，构件网格上没有这些 ID；仓库里目前也没有任何按货位 ID 做拾取的代码，所以「热点不需要重映射」只是因为现在没有热点。
- **将来若需要拾取（可选的集成契约，未实现）：** 在宿主侧对货位包围盒做射线判断；若要在合并后的批次上拾取单个实例，需要为每个实例保留 `instanceId → 货位 ID` 的映射表，并在合并前保存 `mesh.instanceMatrix` 对应关系（`mergeCampusStatic` 当前不保留）。构件目前不导出这张映射表。

## 七、画质、材质合并与真实开销（修正 P2-3 / P2-4）
- **`qualityProxy` 契约（已读 `quality.js` 的 `capture()`）：** 带 `userData.qualityProxy = true` 的网格会被全局画质系统**跳过**（不登记材质、不换轻量材质、不进阴影表）。本构件所有网格都设了该标记（与旧 `campus-racks-static`、`campus-shuttle-vehicle` 一致，测试固定），低画质由构件自己根据构建时的 `quality.tier` 处理（2 行货架、3 层横梁、无斜撑、无缠绕膜、车轮面数更少）。**运行时切换画质 = 宿主 `dispose()` 后用新 tier 重建**；不设标记会让 `quality.js` 持有已释放对象的引用。`quality.js` 本身未改。
- **合并行为：** 接入 campus registry 后，不透明实例批次会被 `mergeCampusStatic` 展开成普通顶点并与整个园区的静态件合成**一个**网格，**材质统一为 roughness .72 / metalness .18、不投阴影**——预览里货架（metalness .45）与钢轨（.55）的金属质感在真实场景里会消失；视锥剔除也只能整块进行；约 1 987 个实例会变成约 4.8 万个顶点。缠绕膜与穿梭机相关网格标为 `dynamic`，保持独立材质（缠绕膜 0.28 透明度，否则会被压成统一的 0.46）。
- **预算数字的含义：** `summary().componentPreviewDrawCalls` 与 `triangles` **只代表隔离预览**，不代表集成后的场景开销（合并后实例批次不复存在；还有 env.js 的 RenderPass / GTAO 倍增口径）。真实增量须由 Trae 在候选版本上成对测量。

## 八、生产状态接线
`buildCampusShuttle` 检测到 `root.userData.vis2RackCell` 后，不构建旧车体或轨道，并在每次 `draw()` 中把 `shuttleFrame(state, time)` 的完整 `{ z, lift, carrying, occupied, status }` 传给 `setShuttle()`。这样空车、货位占用和 `delivery` 状态不会丢失；状态灯的 `delivery` 与 `put` 使用同一作业色。

## 九、自测与变异验证（源码级；**未做浏览器 / GPU 验证**）
`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/dr-vis2-rack-cell.test.mjs`：**18 / 18 通过**。
| 审查问题 | 对应测试 | 变异验证（改坏模块，测试必须变红） |
|---|---|---|
| P2-2 托盘悬空（横梁移到托盘外） | `every pallet rests on both beams…`（用**真实横梁实例位置**，不再用常量自证） | M1 横梁外移 → **KILLED** |
| P2-2 纸箱伸出托盘 | `every carton lies inside its pallet footprint…` | M2 → **KILLED**；M11 同层托盘重叠 → **KILLED（2 项）** |
| 货高越过顶梁 / 超出立柱 | `every rack element stays inside…`、carton 测试 | M12 顶梁层也放货 → **KILLED（2 项）** |
| P1-3 抬升把整车抬离轨道 | `shuttle chassis: wheels sit exactly on the two rails…`、`lift moves only the platform…`（先刷新父级矩阵，真实观察到 lift） | M3 → **KILLED（2 项）**；M13 lift 不夹紧 → **KILLED** |
| P1-1 位置被当序号换算 | `intermediate world positions are reachable…`（真实 `shuttleFrame`，−6.85 / −1 / 4.85） | M4 → **KILLED** |
| 车轮悬空 / 竖向基准不一致 | `one vertical reference…`（baseY 平移所有部件且仅平移 y） | M5 车轮悬空 2 cm → **KILLED（2 项）**；M7 忽略 baseY → **KILLED** |
| P2-1 车轮 / 车体法线与缠绕 | `shuttle geometry: every triangle winds counter-clockwise outward…`（逐三角形） | M6 端盖缠绕反了 → **KILLED** |
| P3 横梁与立柱 1 cm 缝 | `beams are attached to the uprights…` | M10 → **KILLED** |
| P2-3 `qualityProxy` | `quality contract…`（并确认 `quality.js` 仍跳过该标记） | M9 → **KILLED** |
| dispose 重复释放 | `dispose releases every owned resource exactly once…`（按对象计数，必须恰好 1 次） | M8 → **KILLED** |
| 真实注册路径 | `real campus module wiring…`（只注册 `campusModules`） | baseY 改为 `0`、恢复旧 rack/rail/vehicle、删除 `setShuttle` 完整转发均会失败 |
| 货位互穿与纸箱贴合 | `slot pallets clear…`、纸箱/托盘几何断言 | slotX 回退到 `+1.25` 或纸箱整体上移会失败 |
14 项变异**全部被抓住**；其中 M13 一开始**漏网**（只测了车体不动，没测 lift 夹紧），已补断言后复测被抓。脚本与结果见交付报告。
**全量套件（干净克隆，复现）：** 基线 `cbddb9f`：1166 个用例 / 20 个失败；本分支：1184 个用例 / 17 个失败；**本分支新增失败 0 个**（失败集合是基线的子集）。3 个用例（钩子 / 扫描器 / 换行配置夹具）的结果依赖克隆所在路径，所以失败数在 17–20 之间浮动；**旧文档写的「基线 20 个」是在某个路径下的一次测量，审查员测得 19，均为同一批因缺本机运行数据而失败的既有用例。**

## 十、仍未验证（如实）
- **没有任何浏览器 / WebGL / GPU 验证**：车轮与车体法线是在几何层核对的；本修订版**未重新截图**（预览截图是修订前的）。
- 没有真实仓配页面接线、没有同机位前后对比、没有真实 draw call / 帧时间 / 显存数据；没有运行时画质切换验证；没有与 Trae 的地面、屋面、外壳的视觉配合验证。
- 浏览器主场景证据、GPU 预算和同机位视觉对比仍需由候选静态预览或获准的主场景验证通路采集。
- 货位托盘 `vis2-slot-pallets` 是为承载 `occupied` 而新增的显示，位置（展示带东侧通道）是按展示带宽度推得的，需与旧模块的货位托盘位置对照。
