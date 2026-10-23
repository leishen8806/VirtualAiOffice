# VIS2-O — 中央茶水吧与前厅样板

> 以下保留首轮历史记录；最新办公室候选、测试和阻塞以 `VIS3-M1-REPORT.md` 为准。

## 版本与交付边界

- 2026-10-23；分支 `vis2/o-office-sample`，B0 `cbddb9fa3b874f7f56c8410928a8edd23013795c`。
- 工作树 `E:\VirtualAIOffice\vis2-o-office`；实际源码 `office3d`。origin 是 `git@github.com:leishen8806/VirtualAiOffice.git`。提交号见外部交付收据 `E:\VirtualAIOffice\artifacts\vis2-o\delivery.json`。
- 当前唯一 3200 服务仍运行历史 `paperclip-ops\office3d\server.mjs`，没有部署本分支、重启、结束进程或启动第二个服务。
- **交付的是独立可运行美术样板，不是主页面已集成验收通过。** 浏览器由测试工具按资源白名单读取本工作树文件，无新服务器、无生产配置写入。普通生产 URL 目前不会自动提供这个预览页。
- `references/office-target.png`、`references/office-current.png`、`asset-intake/gpt-textures/office` 未挂载。按文字约束和已登记加工材质建模；无法完成指定参考图的构图匹配与对图验收，不能声称“忠实复刻已通过”。没有另造目标效果图替代验收。

## O0：为什么原画面没有显示好

本轮先检查实际入口并保存 `B0/live-before.png`，再修改代码。

| 观察 | 当前证据 | 结论边界 |
| --- | --- | --- |
| 修改旧吧台不影响当前 V3 | 运行中的 layout3/high 加载 office-v3-modules 与 office-island；没有加载 office-bar | 不能再把旧吧台源文件存在等同于当前场景使用它；共享接线交 Trae |
| 石材/木纹缺少区分 | 旧岛台以顶点色合并；已登记 office-v2 材质图片没有请求；几何材质为统一粗糙度 | 此处是真正的局部材质缺口；不是贴图请求 404 的推测 |
| 淡色圆盘缺少结构 | 旧 island 是实心圆柱，没有真实环形操作孔；旧植物是球形组合 | 本样板改为有内孔的台体/厚台面、独立树池及设备 |
| 玻璃乳蓝 | 旧材质使用有色 glass 与约 .62 不透明度 | 本样板自己的玻璃改为中性、低透明遮挡；没有改全局玻璃 |
| 整体发白 | 实际 renderer 为 ACES、曝光 1.2、sRGB；旧平涂缺少表面差异 | 没有证实全局色彩转换有错；未改曝光、renderer、quality 或全局灯光 |

## 做到

### 结构与材质

- 按现有 `barSpec / barArcs / barSeats / barLounges / barColliders` 构建，保留原两处开口和席位 ID、位置、朝向。环形台体、厚台面、内侧操作地面、树池、脚踏吧凳、外围木扶手软座、咖啡机/托盘/水槽/杯具可见。
- 茶水吧中心从 LAYOUT_V3 读取 `(2,-6)`；台体内半径约 2.1 m、外半径 3.5 m；台面最高约 1.05 m。这是当前布局的建模值，不是从缺失效果图测量的施工尺寸。
- 前厅补有接待台、背景木格栅、咖啡柜/置物架、等候弧形座椅、绿植、细框玻璃和入口立柱。中央入口净宽 4 m；接待台与岛台均在 x=2 中轴。
- 暖白/浅米石材、木纹、深灰绿织物、少量香槟金属分别保留粗糙度与金属度，不依赖统一泛光。三张已登记 1024² 材质在浏览器确实请求并绑定。未增加下载、依赖、实时模型调用。
- 复用 B0 已有原创程序化 `office-heart-banyan.js`，不重新造第二套树：约 3.97×3.75×2.79 m 的三维范围、双峰与凹口、灰褐分枝、小叶实例、主面朝 +z 前厅，固定 seed，无新增摇摆循环。树池约 Ø2.1 m。不是新闻照片贴图、整树 billboard 或大叶图集。
- 原叶片图集抽样有真实 alpha，但边缘部分绿色像素不能证明已去溢色；形态也不适合榕树。本样板不用它。详见外部 `alpha-audit.json`；不宣称该旧图集全部合格。

### 模块与生命周期

- 新代码在 `office-vis2/` 私有目录；唯一修改的既有文件是 `office-bar.js`，增加可选 `visualSample`。缺省、损坏、非布尔 true 或缺材质时仍执行原 B0 逻辑。
- 完整样板由 `createOfficeVis2Controller({ THREE, root, layout, low, canvasTex })` 管理，只有 `setConfig({enabled:true})` 才加载图片。`setConfig(null)` / `dispose()` 释放自身资源，销毁期间尚未加载完的纹理会在返回时释放，不晚挂场景。
- 失败恢复由调用者保留的原岛台承担；独立预览实现了这个切换。真实浏览器强制一张材质 404 后恢复关闭状态；没有把“纹理缓存仍命中”的第一次失败注入尝试计作成功。
- 全样板需要带前厅字段的 LAYOUT_V3。旧 V2 `buildOfficeBar` 的可选接口可单独使用；不能把整个前厅控制器直接套到没有前厅数据的旧布局。
- 私有模块没有灯光、业务请求、永久动画循环或轮询；预览页面自己持有测试灯光和 renderer，退出/销毁不触碰宿主资产。有限 120 帧测量不是自主动画。
- 浏览器连续进入退出 10 次：开启态 geometry/texture 均为 **11 / 7 → 11 / 7**；关闭后 **2 / 3**（预览保留原岛台与阴影纹理）。404 降级后也是 2 / 3。单元测试另核对重复 dispose、异步退出、共享纹理不被销毁、碰撞代理只注册一套。

## 给 Trae 的接入说明与坐标映射

`app.js / ui.js / index.html / office-v2-modules.js` 全未修改。以下是待集成接口说明，不是已执行的接线：

1. 在办公室私有注册处明确读取通过校验的开关；缺失/损坏为关闭。控制器自身不读服务器配置。
2. 传入同一 THREE、办公室私有根与 LAYOUT_V3，以及真实 `canvasTex(w,h,draw(ctx,w,h))`。不要建立新 renderer 或帧循环。
3. 成功开启才隐藏原 island 及被样板替换的前厅家具，避免重复叠加；失败保留旧物。退出销毁样板并恢复原物。宿主注册合并器不得抹掉 sampleSurface/sampleUv 或树叶 shader；先按独立模块边界接入与测量。
4. `docs/vis2-o/coordinate-mapping.json` 交付接待台、服务吧、等候区、背景板、入口立柱、玻璃、树池、花盆的世界坐标范围，及原 12 段吧台碰撞盒。
5. 新树池/背景板/花盆/入口立柱仅给坐标，**没有擅自在共享行走或热点系统注册**。接待背景板 h=2.35 m；花盆占地半径 .5 m；树池半径 1.05 m。背景板/花盆应由 Trae 核对可达性与通道，不可以视觉样板当作真人无碰撞证明。
6. 吧凳沿用原装饰席语义；未改变任何 Agent 或工位绑定。原外围沙发锚点保留。单独样板无真人；主线人物进出、坐姿、热点与遮挡仍须接线后实测。

## 实际浏览器证据

全部证据在 `E:\VirtualAIOffice\artifacts\vis2-o`，没有生成图片/视频冒充浏览器。请求通过 Playwright 资源拦截从本工作树提供；记录不是生产部署证明。

- `B0/live-before.png`：原服务修改前真实页面。
- `B0/{overview,eye,bar,treeFront,treeSide}-{1280,1920}.png`：同一独立预览的 B0 原岛台，修改前固定机位。
- `{overview,eye,bar,treeFront,treeSide}-{1280,1920}.png`：新样板同机位、同画质、同分辨率；前厅旧态原本为空，未伪造一个旧前厅。
- `fallback-1920.png`：材质 404 降级；`low-overview-1920.png`：低档。
- `enter-observe-return-1080.webm`：真实 1920×1080 浏览器录屏，关闭→进入→五机位观察→返回。无页面 JS 异常；录屏期间仅页面/模块/Three/三张 JPG 的 GET，无业务 API。
- 相机 FOV42；overview `[2,25,31]→[2,.3,-2]`；eye `[2,1.65,14]→[2,1.7,-6]`；bar `[11,7,3]→[2,1.15,-6]`；treeFront `[2,1.9,2]→[2,2.1,-6]`；treeSide `[10,3,-6]→[2,2,-6]`。曝光1.2、ACES、sRGB、像素比1，前后保持不变。目标构图相机未标定：指定参考图缺失，未假造匹配机位。

### 性能口径

Windows10 / Chromium155 / ANGLE NVIDIA GeForce RTX5070Ti D3D11；1920×1080。无全楼、真人、GTAO 合成的独立预览；不能与主场景预算混算，也不能据此承诺4K/60fps。

| 固定 overview | 模块批次 / 三角形 | 整页实际 calls / 三角形 | geometry / texture |
| --- | ---: | ---: | ---: |
| 关闭，B0 原岛台+地面 | 新模块 0 / 0 | 2 / 3,230 | 2 / 3 |
| 开启，高档 | 9 / 22,660 | 11 / 27,770 | 11 / 7 |
| 开启，低档 | 9 / 17,508 | 10 / 17,510 | 10 / 7 |

- 高档相对关闭的整页增量 +9 calls / +24,540 三角形；低档表是低档开启读数，没有冒称已测低档关闭差值。
- 同次各120帧的短时 RAF 间隔：关闭中位16.7/P95 16.7 ms；开启中位16.7/P95 16.8 ms。此为前台显示节拍观测，不是 GPU timestamp 或全应用长期帧率。
- 缓存/资源拦截条件下，关闭预览 ready 观测上界180.8 ms，点击开启到完成193 ms。不是生产首屏网络性能。
- 尝试切换另一自动化页后，document.visibilityState 仍返回 visible，因此本次不把它计作真实后台隐藏验收；无操作1秒 render.frame 保持246，但只证明闲置不持续渲染。
- 主场景成对预算/真人负载/真实页面隐藏恢复：**未验证**。`measurements.json` 是原始测量记录。

## 测试与未完成项

测试统一使用 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1`，路径明确为 `tests/*.test.mjs`；低可用内存时串行执行。无新增依赖。

- 针对性：`tests/office-vis2.test.mjs tests/office-heart-banyan.test.mjs`，9/9通过。覆盖默认关闭、部分加载失败、异步关闭、重复进出/销毁、真实 canvasTex 参数、公有吧台缺省不变、席位/碰撞不漂移、开口与操作区、榕树形状/比例/资源释放。
- 所有修改的浏览器模块均用标准输入 `node --input-type=module --check` 检查。
- 全量首次：1172项，1154通过、17失败、1跳过、0取消，211698.4007 ms。修正碰撞接收器原型方法转发后再次全量：相同1172项 / 1154通过 / 17失败 / 1跳过 / 0取消，180703.0719 ms，退出码1。完整输出分别为 `full-tests.txt`、`full-tests-final.txt`；没有隐藏失败或放宽原断言。
- 17失败涉及缺少 snapshot 排除的 command-view.json / display-staff.json / town-nav.json、未入库的历史 backup 夹具及 town-map-data，另有 untouched 的 control-room / legacy布局断言失败。没有生成生产配置、伪造旧备份或修改共享测试来造全绿。未在独立 B0 工作树再跑全量，不把本次推断伪装成基线执行结果。
- 需要集成方补齐隔离测试夹具并处理公共基线后重跑；**本轮全量回归未全过**。
- 未做：共享接线、主场景真人碰撞/热点验证、指定图对图验收、全楼推广、CI/发布、生产服务变更。

## 文件与资产

- 修改：`office-bar.js`。
- 新增：`office-vis2/{assets,bar,batch,floor,foyer,frontage,plants,preview,sample}.js`、`office-vis2/MANIFEST.json`、`office-vis2-preview.html`、`tests/office-vis2.test.mjs`、本目录记录与坐标表。
- 复用图像共708,129 bytes；未新增二进制素材。SHA256、尺寸、原记录许可及用途见私有 MANIFEST。生成模型和逐图原提示词未知，未补写假记录；没有把既有来源声明升级成独立权属鉴定。
- 严格未改 app/ui/index、env/quality、全局布局导航、仓配、server/tenancy/业务、版本依赖。未下载、未 push、未覆盖他人工作树。
