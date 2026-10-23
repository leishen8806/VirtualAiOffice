# VIS2-W · B：调度中控室（四席直线控制台）+ 建筑内部接待台与展示墙（组件级样板，尚未正式接入）

**状态：** 组件预览与自测完成；**不是仓配验收通过，也未做集成验收**——Trae 与 harness 的各自检查完成之前不得宣称通过。
**分支与依赖：** `vis2w/dispatch-suite-b`，**基于 A 的提交 `2879124f4f89f64721a0c328bd4d052c25bd6934` 创建**（同一工作树，便于一起预览），但 **B 的代码不依赖 A 的任何文件**（测试里有静态断言：B 只导入 `dr-cambodia-outline.js` 与 `dr-console-data.js`）。B 的提交只含下表的文件，可单独拣选。基线 `cbddb9f` 是**临时 P0**，不是正式 B0。不合并 `main`。

## 一、文件清单（B 的提交只含这四个文件）
| 文件 | 作用 |
|---|---|
| `dr-vis2-dispatch-suite.js` | 私有构件：`buildVis2DispatchSuite({ THREE, root, layout, quality, canvasTex, snapshot })` → `{ group, summary, update, dispose }`；另导出纯绘制函数 `drawDispatchWall / drawDeskAtlas / drawShowcaseAtlas / drawReceptionPlate` 与 `VIS2B_*` 常量 |
| `dr-vis2-dispatch-suite-preview.html` | 隔离预览（标明「组件预览，尚未正式接入」；地面、灯光、`canvasTex` 与快照喂入都是预览夹具） |
| `tests/dr-vis2-dispatch-suite.test.mjs` | 11 个用例 |
| `docs/dr-vis2-dispatch-suite.md` | 本文 |

素材：**无外部素材、无贴图文件**；全部为程序化几何与运行时绘制的画布；柬埔寨轮廓、城市、航线沿用 `dr-cambodia-outline.js`（S2-11 已验收的数据）。

## 二、内容与尺寸（米；区域沿用 `CAMPUS_ZONES`，不改任何布局）
**中控室（`dispatch`：x −168…−154，z 0…16；净高 4.0，低于屋面 4.68）**
- 大屏在西墙：**6.8 × 2.833 m（2.4:1，超宽）**，画布 1920×800（同比例，不拉伸）；深色细边框；上方与踢脚各一条暖色灯带；两侧木格栅吸音墙。
- **屏幕内容：** 柬埔寨轮廓 + 金色高亮的**金边（Phnom Penh）节点**与中英文标签 + 到各城市的航线；KPI（入库 / 出库 / 在途运单 / 准时率）、三条运单进度、三条最近事件；**「模拟数据 · 示意」常驻两处（标题栏右侧与底部整行），缺快照时同样显示**。
- **单排四席直线控制台：** 一条连续长桌（长 8.8 m，暖白台面 + 橡木前沿 + 深色裙板 + 线槽），座位间距 2.1 m 等距；**四把办公椅**（面向大屏，各带轻微确定性转角）；**每席双显示器**（共 8 块，合并为 1 个带图集 UV 的几何，四个席位各显示入库 / 在途 / 进行中任务 / 异常预警）。
- **玻璃围合：** 细黑框 + 通透玻璃（不透明度 0.16），东面向仓储（操作员背后能看到仓储）、南墙留 2.0 m 门洞（服务通道方向）。
- **暖色建筑化照明：** 吊顶三条发光灯带（自发光材质，不新增真实灯源）。绿植两盆。
**访客接待区（`visitor`：x −168…−154，z 20…30）：** 石材 + 橡木格栅前台（暖色底部灯线）、内侧工作台、背景墙 + 金色铭牌（「DR 仓配服务中心 · 访客接待 · 示意」）、两把接待椅、两张沙发 + 圆几、三盆绿植。
**服务中心展示区（`showcase`：x −154…−130，z 20…30）：** 北墙 18.5 m 展示墙（木格栅护墙、金色边框的 5 个背光展龛，画面为 W1 / W2 / W3 / 设备与维护 / 访客与展示的**静态说明，标注「示意」**）、每个展龛下一个石材展台、中央展示台（含仓配园区缩微盒体模型）、四角绿植。
**不在本构件范围内（未画）：** 门槛外的台阶、门牌立牌、停车、道路、月台、货车、入库质检、一切公共地面（本构件**不铺地面**）、墙体外壳。

## 三、数据与生命周期（接入契约）
- **快照从外部传入：** 构造时 `snapshot`，之后宿主调用 `update(snapshot)`。快照形状沿用 `dr-demo-snapshot.js` / `dr-console-data.js` 的 `buildSnapshot`（需要 `warehouses / inventoryByCategory / waybills / vehicles / tasks / alerts / events`）；字段不全时画面显示「未提供快照」，**不编造数字**。**不依赖也不导入**演示事件源，不自带随机数据。
- **版本：** `update` 以 `snapshot.generatedAt` 为版本；版本不变返回 `false`，不重绘、不上传纹理；变化时各重绘一次并 `needsUpdate`（预览中每 1.8 s 一档，4.5 s 内重绘 2 次）。**构件内没有定时器、RAF、轮询或网络请求；** 谁驱动时钟由宿主决定（建议用 S2-14 已有的共享演示时钟）。
- **`canvasTex` 契约：** 必须是宿主同签名的 `canvasTex(w, h, draw)`，`draw` 收到 `(ctx2d, w, h)`，返回的纹理要有 `image.getContext('2d')`（更新时重绘用）。测试里用了忠实的宿主替身。
- **`dispose()`：** 幂等；只释放自己创建的几何、材质与 4 张纹理（墙屏 / 桌面图集 / 展龛图集 / 铭牌）；调用后 `update` 返回 `false`。
- **注册规则：** 玻璃与自发光批次标记 `dynamic`，避免被 `mergeCampusStatic` 并成统一材质 / .46 透明批次；带贴图的屏幕本来就不被合并；其余不透明实例批次由 registry 合并。

## 四、预算（构件自报；同一静态预览）
| 画质 | draw calls | 三角形 |
|---|---|---|
| 高 | **9**（5 个实例批次 + 桌面屏 + 墙屏 + 展龛画面 + 铭牌） | **5 478** |
| 低 | 9 | **3 982**（圆柱 / 叶簇降面） |
纹理：1920×800、1024×576、2560×384、1024×256 四张画布。接入主场景后的真实增量（含 RenderPass / GTAO 口径）需 Trae 在候选版本上成对测量。

## 五、自测
`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/dr-vis2-dispatch-suite.test.mjs`：**11 / 11 通过**（含 A 的 10 项，两个文件合计 21 / 21）。覆盖：屏幕有轮廓 / 金边高亮 / 常驻模拟标签 / 数值来自快照；缺失或损坏快照不编造数字；绘制是快照的纯函数；屏幕与画布同为 2.4:1；恰好四席等距单排、每席两块显示器；三个区域各在自己的区内、低于屋面、无地面板；`update` 的版本语义与 `dispose` 后失效；在真实 `createCampusRegistry` 里构建且玻璃 / 自发光 / 屏幕不被合并；低画质更轻；`dispose` 幂等并释放自己拥有的几何、材质与纹理；源码不含 RAF / 定时器 / 随机 / 网络 / 渲染器，且依赖只有两个。
全量套件（干净克隆）：**新增 0 个失败**（基线 20 个因缺本机运行数据而失败的用例，集合不变）。

## 六、旧对象替换清单（不得叠加）
| 旧对象 | 处理 |
|---|---|
| `campus-dispatch-simulation`（`dr-campus-interior.js`，**合并的一个网格**，含调度中控后墙屏与服务中心展示墙的大黑屏） | 两块都由本构件替换（后墙屏 → `vis2b-wall-screen`；大黑屏 → 带背光展龛的展示墙）；Trae 需在旧模块里整体停用，或拆分后只保留其它用途 |
| `campus-interior-static`（占位家具，同一实例化网格里还混有办公会议区、设备维护区的占位） | 只停用调度中控 / 访客接待区 / 展示区三个区的占位，保留其余两个区 |
| `dr-control-room.js` 的 `buildDrControlRoom`（`?controlRoom=1` 的独立中控室原型） | 启用本构件后不得同时显示，否则中控室重复；其数据口径（`controlRoomScreenSummary`）可作参照，**不要再造事件源** |
| 仍共享 | `CAMPUS_ZONES`（只读）、`dr-cambodia-outline.js`、`dr-console-data.js`、`dr-demo-snapshot.js`（由宿主喂数，不由本构件导入） |
| 热点 | `dispatch / visitor / showcase` 区 ID 与范围未变，**热点不需重映射**；若有指向旧网格的拾取需改指新对象；点击大屏进入 `dr-console.html` 沿用现有导航（本构件不新增入口逻辑，可在 `vis2b-wall-screen` 上挂宿主的拾取） |

## 七、给 Trae 的最小接线说明（本构件不自行接线）
1. `dr-campus-modules.js` 登记：`['vis2Dispatch', (context) => buildVis2DispatchSuite({ ...context, canvasTex, snapshot: demoSnapshotAt(DEMO_BASE_SNAPSHOT, sharedDemoElapsedNow()) })]`（`canvasTex` 用宿主的那一个）。
2. 在既有的共享演示时钟回调里（S2-14 / `sharedDemoElapsedNow`）调用 `suite.update(demoSnapshotAt(DEMO_BASE_SNAPSHOT, elapsed))`，**不新增 RAF / 定时器**；停止演示时调用 `suite.update(DEMO_BASE_SNAPSHOT)`（回到静态快照）。
3. 停用上节的旧对象；离场时 `dispose()`。
4. 注意：四席桌面屏与大屏用同一份快照，因此与二维调度台、中控屏的数字一致由「同一 `elapsed`」保证，不是构件自己同步。

## 八、缺口（如实）
- 静态场景；没有操作员人偶；桌面屏文字较小（近景可读，总览不可读）。
- **只做了组件预览，没有接入真实场景**，没有同机位前后对比、没有真实浏览器录屏；与 Trae 的外壳、地面、屋面的视觉配合未验证；预览的灯光是夹具，真实场景下墙面 / 木色的观感需复测（预览中暖白墙偏灰是灯光夹具所致）。
- 展龛内容是静态说明，不含运行数据；接待区只做了前台 + 休闲角；门洞位置是我按南向服务通道假定的，需与外壳的真实门洞对齐。
- 屋面高度 4.68 m 取自 `dr-campus-shell.js`；没有 B0，坐标契约由 `CAMPUS_ZONES` 推得，已与运行目录同名文件逐字节核对。
