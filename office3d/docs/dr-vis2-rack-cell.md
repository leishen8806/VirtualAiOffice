# VIS2-W · A：高位货架 + 轨道式托盘穿梭机 + 托盘货物（组件级样板，尚未正式接入）

**状态：** 组件预览与隔离自测完成；**不是仓配验收通过，也不是集成验收**。本文是 **FIX2 修订版**，回应对 FIX1 提交 `7b35a26d719a01b735caa3c76b7b2761ee3ff10f` 的独立复审（结论 `CHANGES_REQUIRED`，新发现 N1–N6）。FIX1 之前的审查对象是 `2879124f4f89f64721a0c328bd4d052c25bd6934`。
**分支：** `vis2w/rack-cell-a-fix2`（基于 `7b35a26…`，不改写它和 `2879124…`）；最初的基线 `cbddb9fa3b874f7f56c8410928a8edd23013795c` 是快照分支，不是 `main`。**独立审查员必须复审新提交后才能进入集成。**

## 一、交付内容（FIX2 相对 7b35a26 的变更文件）
`office3d/dr-vis2-rack-cell.js`、`office3d/dr-vis2-rack-cell-preview.html`（改用真实事件源驱动）、`office3d/tests/dr-vis2-rack-cell.test.mjs`（24 项）、`office3d/docs/dr-vis2-rack-cell.md`（本文）。
**未改动：** B / B1、`office3d/docs/dr-vis2-bb1-contract-audit.md`、所有共享园区模块（`dr-campus-*`）、`quality.js`、`app.js`、`env.js`、主渲染器与生产配置。
素材：无外部素材、无贴图；全部程序化几何。穿梭机是原创低矮轨道车，不是叉车或载人机器人。

## 二、构件接口与配置参数
`buildVis2RackCell(options)`，`options = { THREE, root, layout, quality, seed = 4207, rows = null, baseY }` → `{ group, summary, setShuttle, dispose }`
- `layout`：`{ campus, zones, shuttle }`（来自 `office-layout.js`，只读）。`quality`：`{ tier: 'high' | 'low' }`，**构建时**决定；运行时切换画质需要宿主 `dispose()` 后重建（见第七节）。
- `seed`：确定性随机（货位占用 / 层数 / 缠绕膜）。`rows`：要建的货架行标签数组（默认全部 4 行；传 `[]` 或未知标签得到 0 行，不报错）。
- **`baseY`：完成面地坪标高（米）。** 构件内部所有竖向尺寸都以「地坪 = 0」计，整个 `group` 放在 `baseY` 上（`group.position.y = baseY`），单一竖向基准。
  - **按「是否传入」判断（FIX2 修正 N4）：** 没传（或传 `undefined`）时用 0，`summary().baseYSource` 写「默认 0：仅为组件预览 / 测试夹具，不是生产标高」；**显式传 `baseY: 0` 视为宿主给的标高**，写「宿主传入」。`null`、`NaN`、`Infinity` 抛错。
  - 真实地坪标高尚未确认（`dr-campus-shell.js` 的建筑地面平面在 y = −0.54，各旧模块家具从 y = 0 起算），**我没有编造生产值**；campus registry 传给 factory 的上下文里没有 `baseY`，集成方需自己包一层传入。
- `summary()`：含 `vertical`（相对地坪：`railTop 0.105 / wheelBottom / chassisTop 0.54 / maxLift 0.12 / rackTop 4.4 / topBeam 4.16`）、`state`（`source: 'fixture' | 'host'`）、`componentPreviewDrawCalls` 与 `triangles`（**只代表隔离预览**，见第七节）。

## 三、造型与尺寸（米，y 自地坪）
- **货架**（取自 `createCampusRackPlan` 的 A1/R2/C2/B2 与各 6 个货位）：单深选择式，框架进深 1.1 m 居中于 2 m 占地；立柱 0.1×4.4 **#2F6FA8**、横撑 / 斜撑同色；横梁 4 道（0.2 / 1.5 / 2.8 / 4.1）**#E8832A**，横梁两端各插入立柱 1 cm（无缝），第 4 道只作顶梁不放货。每货位两个托盘，约 22% 空位。
- **托盘与货物：** 托盘 1.2×1.0×0.12，搭在两条相距 0.95 m 的横梁上；纸箱每层 2×2，间隙 5 mm、不随机抖动位置，2–3 层，货高 ≤ 0.95 m；约 72% 带半透明缠绕膜。货顶最高 3.93 m，低于顶梁 4.16 m。货架区上方没有整片屋面（屋面只覆盖南北各 5 m 的带，外墙高 4.5 m），**没有对着屋面做碰撞核对**。
- **轨道：** 两条钢轨（轨距 1.4 m，展示带中线 ±0.7 m），轨顶 0.105 m；枕木每 0.8 m 一根，**FIX2 起长 1.7 m（中线 ±0.85，伸出钢轨外缘 0.11 m）**，原来是 1.9 m；四个端部缓冲块。车体底面离地 0.26 m，离轨顶 0.155 m。
- **穿梭机（拆成三块，lift 只动承托板）：** `vis2-shuttle-chassis`（车体 1.7×0.28×1.1 + 四个车轮 + 侧面识别条 + 缓冲；车轮底面 = 轨顶面，任何 lift 下都不动）、`vis2-shuttle-platform`（承托板，lift = 0 时底面贴车体顶面 0.54 m）、`vis2-shuttle-load`（承托板上的托盘与纸箱，随承托板上升；`carrying = false` 时隐藏）、`vis2-shuttle-lamp`（状态指示灯）。
- **停放托盘 `vis2-slot-pallets`（FIX2 修正 N2）：** 三个货位的停放托盘按 `occupied` 显示，放在轨道东侧的停放位，中心 x = 中线 + **1.45**（原 1.25），托盘 x 范围为中线 +0.95…+1.95（在布局里约是 −145.05…−144.05，展示带东界 −144，留 5 cm）。
  - 与车体识别条外缘（中线 +0.862）间隙约 9 cm，与枕木端部（+0.85）间隙 10 cm。原来与车体重叠 7.5 cm、3 处垫木压进枕木，这两个问题都已消除。
  - 测试在三个货位、三种 lift 下逐一检查车体、承托板、车载货物、指示灯与停放托盘之间无穿插，并检查停放托盘不碰钢轨、枕木、缓冲块和货架。
- **几何质量：** 车体与货物每个面独立顶点、法线精确；车轮侧面法线径向、端盖法线沿轴、缠绕方向统一朝外（逐三角形测试）。车载托盘内部堆叠关系（垫木底 = 承托板顶、面板底 = 垫木顶、托盘总高 0.12）也有测试。

## 四、宿主状态接口：`setShuttle(next)`（本构件**不**含任何模拟引擎、RAF、定时器或业务状态）
| 字段 | 含义 | 校验 |
|---|---|---|
| `z` | **世界坐标 z**，直接等于 `shuttleFrame(...).position`；夹在轨道行程 `[plan.path.z0, plan.path.z1]`（−6.85…4.85）内 | 非有限数忽略 |
| `lift` | 承托板与货物的抬升，0…0.12（= `SHUTTLE_MAX_LIFT`）；车体与车轮不动 | 夹紧；非有限数忽略 |
| `carrying` | 是否载货（决定车载货物是否可见） | 只接受布尔 |
| `occupied` | 三个货位是否有停放托盘 | 只接受长度 3 的布尔数组 |
| `status` | 指示灯颜色，见下 | 只接受字符串 |

- **状态词表（FIX2 修正 N1）：** 只认真实 `shuttleFrame().status` 会产出的三个值，颜色与旧 `dr-campus-shuttle.js` 的指示灯相同：`idle` 绿 #61DF72、`pickup` 黄 #F0C63C、`delivery` 橙 #E8832A（导出为 `VIS2_STATUS_LAMP`）。
  - FIX1 写的 `moving / put` 在宿主里根本不存在，已删除。
  - 其它任何字符串（包括 `moving`、`put`、`constructor`、空串）显示灰色「未知」#8E979C。
  - 测试用旧模块真实的演示事件源（`createDemoShuttleEventSource` → `confirmedShuttleEvents` → `applyShuttleEvent` → `shuttleFrame`）跑 32 秒，三种状态都被走到并逐帧核对灯色；不再用手写的假状态。
- 返回 `true` 表示至少一项被采纳；未传的字段保持上一次的值。`campusMotion=0` 仍由宿主控制：宿主不再调用 `setShuttle` 即静止，构件不读 URL 参数。
- **夹具初始状态（FIX2 修正 N6）：** 直接取 `initialShuttleState(plan)`，与旧模块相同：slot-a（z = −6.85）、**不载货**、`occupied = [true, false, true]`、`idle`、lift 0。FIX1 文档说「与旧模块初始状态一致」，实际是 slot-b 且载货，说法不实，已改正。`summary().state.source` 为 `fixture`，直到宿主第一次传入状态。
- **位置语义（FIX1 已修正，保留）：** `shuttleFrame.position` 本来就是世界 z（−6.85 / −1 / 4.85），**不是**货位序号，不得再换算。
- **货物归属与取放货（N2 的契约部分，如实说明）：** 构件只显示宿主给的归属，测试按整段真实事件序列核对「车上 + 停放的托盘数 = `palletCount(frame)`」，构件不会多出或丢掉托盘。
  - 宿主契约里取放货是**瞬时的**：`shuttle_pick` 同时把 `occupied[i]` 置 false、`carrying` 置 true（随后 600 ms 内 lift 升到 0.12），`shuttle_put` 反过来。契约里没有「托盘横移」的中间状态。
  - 所以在取放货那一刻，托盘从停放位（车旁 1.45 m）换到车上，或反过来。这是**静态上几何正确的状态之间的离散切换**，构件没有为了画横移动画去另造状态。
  - 对照：旧模块把停放托盘悬空放在轨道中线 y 1.18（与车载托盘同一位置），切换看不出跳动，但托盘没有支撑，而且车载托盘经过有货的货位时会与停放托盘相交。
  - 本构件选择「几何正确 + 离散切换」。车宽 1.7 m 大于托盘宽 1.0 m，停放支架无法既托住托盘又让车从下方通过。
  - **集成需求（需集成方 / 董事会决定，本次未实现）：** 若要连续的取放货动画，需要宿主契约增加取放货进度（例如 `transfer: 0…1` 或 pick / put 开始时刻），并确定停放支架的造型（支架比车宽，或车改窄），再由构件补动画。

## 五、旧对象替换清单与集成决定（属于 Trae 的集成范围，本构件不替代共享地面）
| 旧对象 | 决定 |
|---|---|
| `campus-racks-static`（`dr-campus-racks.js` 的 `buildCampusRacks`） | 停用其中的货架立柱 / 横梁 / 货物箱体，**以及穿梭机展示带的旧底座板（y 0.06…0.18，会把新钢轨与枕木整根埋住）**；该实例化网格还混有工位与月台门，需让旧模块**跳过货架、货物与穿梭机底座并保留其余**，不要整体删除 |
| `campus-shuttle`、`campus-shuttle-static` | 由本构件的 `vis2-shuttle`、`vis2-slot-pallets` 与 `vis2-rails` 替换 |
| 货架区功能区体块（`dr-campus-shell.js` 的 `campus-zone-highRack`，y 0.06…0.78；低画质下是不透明材质，会遮住车体、轨道、第 1 层横梁与托盘下部） | 改为地面标线 / 贴地标记，不再用不透明体块；真实地坪保留 |
| `campus-rack-labels` | 保留；但上面「穿梭机展示位（预留）」的文案接入后已过时，需改文案 |
| 仍共享 | `CAMPUS_ZONES`、`CAMPUS_SHUTTLE_STRIP`、`createCampusRackPlan`、`shuttlePlan`、`initialShuttleState`（只读导入） |

**集成前提：** ① 董事会 / 集成方确认真实完成面标高并通过 `baseY` 传入；② 旧底座板与不透明区块体块按上表处理。测试里的夹具（`legacy conflict fixture`）固定了「不拆旧底座板，轨道就被埋」这一事实，但不解决这个冲突。

## 六、拾取契约（本任务**不**新增拾取功能）
- **实例化网格会被 `mergeCampusStatic` 合并并移出场景：** 合并后 `vis2-rack-frames / pallets / cartons / vis2-rails` 与旧的 `campus-racks-static` 都不存在。
- 保留为独立网格的只有 `vis2-rack-film`、`vis2-shuttle-chassis / platform / load / lamp`、`vis2-slot-pallets`。FIX2 的测试逐个断言这些**网格**在真实 registry 合并后仍然存在，不只断言外层 Group。
- 渲染对象名不能当拾取目标；稳定的是布局里的逻辑货位标识（`rack-A1-1…rack-B2-6`）。仓库里目前没有任何按货位 ID 拾取的代码。
- 将来若需要拾取：在宿主侧对货位包围盒做射线判断；或在合并前保存 `instanceId → 货位 ID` 映射（`mergeCampusStatic` 当前不保留）。构件目前不导出该映射。

## 七、画质、材质合并、资源所有权与真实开销
- **`qualityProxy`：** 本构件所有网格都设了 `userData.qualityProxy = true`，全局画质系统 `quality.js` 的 `capture()` 会跳过它们。低画质由构件按构建时的 `quality.tier` 自己处理：2 行货架、3 层横梁、无斜撑、无缠绕膜、车轮面数更少。**运行时切换画质 = 宿主 `dispose()` 后重建。**
- **合并行为：** 接入 campus registry 后，不透明实例批次会被展开并与整个园区的静态件合成一个网格，材质统一为 roughness .72 / metalness .18、不投阴影，货架与钢轨的金属质感在真实场景里会变弱；约 1 987 个实例变成约 4.8 万个顶点。
- **`dynamic` 标记（FIX2 修正 N3）：** `vis2-shuttle`（Group）、`vis2-slot-pallets`、`vis2-rack-film` 标为 `dynamic`，不参与合并。
  - 缠绕膜因此保持自己的 0.28 透明度（否则会被压成 0.46），穿梭机与停放托盘因此能被 `setShuttle` 驱动。
  - 测试在真实 registry 里构建后调用 `setShuttle`，核对车体跟随 z、lift 只抬承托板、载货可见性切换，并核对缠绕膜材质的透明度、`transparent` 与 `depthWrite`。去掉任何一个 `dynamic` 标记，测试都会失败。
- **资源所有权（FIX2 修正 N5）：** `mergeCampusStatic` 合并时会释放被合并网格的几何并移出场景。
  - 构件给每个自有几何挂 `dispose` 事件监听，自己的 `dispose()` 只释放还没被释放的几何。
  - 结果：单独构建、重复调用、以及在 registry 已合并并释放源几何之后，每个几何与材质都**恰好释放一次**。registry 不释放源材质，材质始终由构件释放。
  - FIX1 测试名写「after registry merging 恰好一次」，实际 registry 路径只断言了不抛错，且有 4 个几何被释放两次；现在两条路径都按对象计数断言。
- **预算数字：** `componentPreviewDrawCalls` 与 `triangles` 只代表隔离预览，不代表集成后的场景开销。FIX1 里那条「draw call 由场景图数出」的断言只是把同一段遍历再写一遍，没有检出能力，FIX2 已删除；**集成后的真实 draw call 与帧时间属于浏览器 QA**，须由 Trae 在候选版本上成对测量。

## 八、最小的「只读状态接口」需求（不修改 `dr-campus-shuttle.js`）
旧 `buildCampusShuttle` 的 `state` 是闭包里的私有变量，没有导出。要用 `setShuttle` 驱动，需要它只读地提供：
1. 每次状态更新后的 `shuttleFrame(state, time)` 结果，例如暴露 `getFrame(time)` 或一个 `onFrame(frame)` 回调；
2. 一个「只算状态、不建网格」的选项，或在新构件存在时跳过车体与轨道的构建。

这是对共享文件的改动，需要集成方实施并经董事会批准。预览页目前用同一组导出函数（`createDemoShuttleEventSource` → `confirmedShuttleEvents` → `applyShuttleEvent` → `shuttleFrame`）在页面里自己折叠状态，只作夹具。

## 九、自测与变异验证（源码级；**未做浏览器 / GPU 验证**）
`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/dr-vis2-rack-cell.test.mjs`：**24 / 24 通过**。

**FIX2 发现 → 测试 → 变异（改坏模块，测试必须变红）**
| 发现 | 对应测试 | 变异 |
|---|---|---|
| N1 状态词表 | `status vocabulary…`（真实事件序列，三种状态全覆盖，逐帧核对灯色；灯色从旧模块源码读取） | X1 delivery 用绿灯、X2 加回 `moving`、X3 查表不做自有属性判断 → 全部 **KILLED** |
| N2 停放托盘与车体 / 枕木穿插 | `parked pallets are geometrically valid…`（3 货位 × 3 种 lift × 4 个车上部件；钢轨 / 枕木 / 缓冲块 / 货架；在展示带内；枕木托住钢轨） | X4 回到 1.25、X5 枕木伸长、X6 停放托盘放到轨道中线 → 全部 **KILLED** |
| N2 货物归属 | `cargo ownership follows the host…`（40 秒真实事件序列，托盘数 = `palletCount(frame)`） | X12 停放显示反了、X13 载货可见性反了 → **KILLED** |
| 货物位置与支撑 | `carried cargo is centred on the platform…`（中心对齐、垫木 / 面板 / 纸箱堆叠、托盘总高） | X11 车载托盘偏 0.2 m → **KILLED**；X18 面板与纸箱下沉 2 cm → 第一次**漏网**（只看外包盒，垫木底面没变），补了堆叠断言后 **KILLED** |
| N3 `dynamic` 与透明包裹 | `inside the real campus registry…`（合并后网格仍在且能被 `setShuttle` 驱动）、`dynamic markers…` | X7 / X8 / X9 去掉穿梭机 / 停放托盘 / 缠绕膜的 `dynamic`、X10 透明度改成 0.46 → 全部 **KILLED** |
| N4 显式 `baseY: 0` | `one vertical reference…`（显式 0 →「宿主传入」，`undefined` → 预览，`null` 抛错） | X14 按真假值判断 → **KILLED** |
| N5 重复释放 | `dispose releases every owned geometry and material exactly once…`（registry 路径按对象计数） | X15 去掉「已释放就跳过」→ **KILLED** |
| N6 夹具初始状态 | `fixture initial state is the legacy initial state…` | X16 初始在 slot-b、X17 初始载货 → **KILLED** |
| 绘制调用常量 | —（同义反复的断言已删除，见第七节） | 不适用 |

**FIX1 的 14 个变异（M1–M14）在 FIX2 上复跑：全部 KILLED**，内容是横梁外移、纸箱伸出、lift 抬整车、位置当序号、车轮悬空、端盖缠绕反、忽略 baseY、重复释放、去 `qualityProxy`、横梁留缝、托盘重叠、顶梁放货、lift 不夹紧、缠绕膜去 `dynamic`。
**变异集的局限：** 这些变异由作者挑选。复审员上次另做的变异里有 4 个当时存活：常量 drawCalls、去掉穿梭机 `dynamic`、停放托盘放到轨道上、映射 delivery。其中后 3 个已分别对应 X7、X6、X1 并被抓住；常量 drawCalls 已不再断言。

**全量套件（基线对比）：** 见交付报告；数字以独立复审员的复现为准。

## 十、仍未验证（如实）
- **没有任何浏览器 / WebGL / GPU 验证**；FIX2 **未重新截图**，董事会审阅目录里的截图是修订前的。预览页改用真实事件源驱动，只做了语法检查，没有在浏览器里跑。
- 没有真实仓配页面接线、同机位前后对比、真实 draw call / 帧时间 / 显存数据；没有运行时画质切换验证；没有与 Trae 的地面、屋面、外壳的视觉配合验证。
- 真实完成面标高未确认；旧底座板与区块体块的处理（第五节）待 Trae 集成后复测；取放货连续动画需要的契约增补（第四节）待决定。
- 停放位（中线 +1.45）距展示带东界只有 5 cm，若集成方调整 `CAMPUS_SHUTTLE_STRIP` 宽度需要复核（测试会在越界时失败）。
