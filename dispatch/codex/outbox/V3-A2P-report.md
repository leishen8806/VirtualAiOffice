# V3-A2P 候选回执：半径解耦与开放区陈设

## 基线与范围

- 从 `integration/office-evidence-20261023 @ 345cd39f7dddebf4e4e61e146af7a283cd415088` 新建 `feat/v3-align-sample`，开工工作区干净。
- 派单读取 `dispatch/codex @ ecf2d41224107dcaa656e9d120aa0274ee8f675e`；方案甲 JSON 读取 `83ecc1b`。没有合并方案或 Trae 工作分支。
- 候选为本回执所在提交，推送后完整 SHA 与远端核验值写入外置证据清单。所有修改均在卡片白名单；不接主场景、不改布局、导航、业务工位、共享加载器或服务。

## 做到：A 吧台半径

`barSpec` 分别返回 `counterRadius` 与 `collisionRadius`，保留原 `radius` 别名。台身、台面、装饰与品牌使用服务台半径；碰撞和东西开口使用碰撞半径。榕树/树池源码未改。

| 夹具检查 | 实际值 / 证据 |
|---|---|
| `bar.radius / island.barOuter` | 6 / 3.5m |
| 实际台身底沿顶点最大半径 | 3.5m，3e−6m 数值容差 |
| 台面外沿 | 3.545m，保留原 45mm 外挑 |
| 碰撞外沿 | 6m，12 个碰撞盒 |
| 东西开口 | x = −4 / 8，z = −6.75…−5.25，宽 1.5m；沿整条东西通道逐点断言不进入碰撞盒 |
| 吧凳 | 10 席按 `bar.seats` 的 ID/坐标；已批准数据取整到 0.1m，实际半径约 4.2m，不二次投影 |
| 无显式席位数据的吧凳 | 精确按 `island.stoolRadius=4.2` 生成，高档10、低档6 |
| 沙发 | 6 席，圆心到锚点半径 5.8m |
| 树池 / 榕树 | 顶点、法线、颜色、索引与实例矩阵哈希不变 |
| 品牌 | 新夹具与旧台身品牌几何/标记一致，未随碰撞环漂移到 6m |

**兼容说明**：B0 的视觉吧凳/沙发实际是 4.4 / 5.25m，虽然旧布局字段是 4.2 / 5.8m。本卡同时要求旧几何逐字节相同，故保留「两半径相同」时的旧陈设；只在服务台和碰撞半径分离的新输入采用布局席位与环距。不修改旧座位合同或增加新布局字段。后续若需要对其他等半径布局也切换陈设合同，须另行改变这个兼容边界。

修改前在 B0 实际生成高低档全部 mesh 的 position/normal/color/index、其他表面属性、instanceMatrix 与世界矩阵快照，保存为 `docs/v3-a2p-baseline-geometry.json`。新测试逐项比较，不在测试时重新生成“预期值”；碰撞数组、座位、沙发与统计也全部比较。高档旧吧台 13,960 三角形、低档 9,040，均保持 6 批次。外置生成脚本与原文件备份可核对来源。

O-06 FIX3 全部 11 项通过，含 1,375 路线矩阵。这个结论只覆盖现有 V3，**不代表新 6m 包络的真人路线已经通过**。

## 做到：B 开放区组件

新增私有 `open-furnishing.js`，复用 `createSampleBatch`，确定性生成并输出实际顶点包围盒、碰撞盒、顶点范围和跳过清单。没有调用碰撞注册、业务接口、Agent 或新增动画循环；共享贴图不由本模块销毁。

方案甲预览：外框 `x=−28…−8.5, z=−4.5…5.5`，六工位坐标直接来自批准 JSON。灰桌仅作位置示意，不创建业务工位。保留半径 1m 的工位空间，再加 0.6m 避让；横纵通道宽 1.4m，是本卡样板建议而非已接入的导航。

| 类别 | 数量 | 尺寸/位置摘要 |
|---|---:|---|
| 共享长桌 | 2 | 3.2×1.2m，中心 (−26.1,−3.6)、(−21.6,−3.6) |
| 矮储物柜 | 3 | 1.6×0.5m，高0.78m；z=−3.95，x=−16.4/−13.4/−10.4 |
| 绿植岛 | 4 | 计划占地1×1m，实际包围盒另导出；(−9.7,−1.7)、(−27.2,−1.2)、(−23.2,0.8)、(−19.7,0.8) |
| 矮隔断 | 3 | 1.6×0.22m，高1.15m；(−9.9,0.41)、(−26.9,0.91)、(−26.9,2.41) |

所有 12 项均放入、`skipped=[]`；真实几何占地不重叠、不压工位、不进入保留通道，陈设之间至少留 1.2m。测试同时验证实际合批顶点均落在对应导出包围盒中，矮隔断 ≤1.2m、低档减面、重复生成一致、无空间时明确跳过、窄通道或无效保留半径拒绝、重复销毁安全。

| 同机位切换陈设可见性 | 高档 | 低档 |
|---|---:|---:|
| 模块三角形 | 1,752 | 936 |
| 模块绘制调用增量 | +1 | +1 |
| 预览整页 calls（关→开） | 13→14 | 12→13 |
| 预览整页三角形（关→开） | 29,864→31,616 | 19,016→19,952 |
| 上限 | ≤8,000 / ≤2 calls，达到 | 低于高档 |

## 真实浏览器与隔离

- 入口 `office-vis2-preview.html?islandFixture=align&q=high` / `q=low`。普通预览和主场景不自动开启新夹具。预览已有绘制函数、画质切换及退出资源清理复用，新增内容没有自己的帧循环。
- Windows，Headless Chromium 156，1920×1080，DPR=1。静态文件由浏览器请求拦截映射至本分支；`/state` 仅空夹具，其他业务接口 404，外部及非 GET 请求阻断，没有请求穿透真实服务。
- 高低档分别拍吧台45度、榕树正面、开放区陈设；两档预览控制台错误均为0，业务请求均为0。
- 每档3轮进入/退出：陈设根始终1个、导出占地12个，资源计数稳定为高档15几何/8纹理、低档15几何/6纹理。仅证明这3轮观察，无长期内存稳定性承诺。
- 主场景 `?layout=3&officeSample=1&q=high&wall=1` 以同夹具、seed=812、同机位比较：overview/plaza/drlife/前厅分别仅 42/42/34/119 个像素不同，共2,073,600像素，最大通道差分别1/1/1/3。符合仅渲染噪声，不宣称截图全部逐字节相同。
- 主场景 overview 成对为122 calls / 263,575三角形，均不变；其他视角部分帧的既有 pass/异步时序计数不同，原始值保留，未据此宣称所有视角性能逐数相等。几何哈希与截图是本卡旧画面一致性的主要证据。
- 浏览器验收结束已离场、移除路由并关闭验收页面。没有启停服务或改运行配置。

外置证据集：`review-artifacts/V3-A2P`（本地审查工件，未上传公共图床、未写入 Git 大图历史）。

- `align-{high,low}-{bar,treeFront,open}.png`：6张夹具截图。
- `seeded-{before,after}-high-{overview,plaza,drlife,foyer}.png`：8张主场景对照。
- `preview-browser.json`、`main-browser.json`、`paired-furnishing-performance.json`：真实页面记录。
- `geometry.json`、`image-comparison.json`、`test-comparison.json` 与原始日志/脚本。
- `evidence-manifest.json` 在提交推送后绑定完整 SHA、来源、文件哈希与相机。独立审查者须能访问该本地目录。

相机：夹具吧台 `[11,7,3]→[2,1.15,−6]`，榕树 `[2,1.9,2]→[2,2.1,−6]`，开放区 `[−18.25,16,18]→[−18.25,0,0.5]`，FOV42°。主场景使用原 wallGo 的 overview/plaza/drlife；前厅使用原焦点，完整参数见记录。

## 测试

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 office3d/tests/office-v3-align-sample.test.mjs office3d/tests/office-v3-meeting-navigation.test.mjs office3d/tests/office-vis2.test.mjs
ℹ tests 39
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1668.3938

cd office3d
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs
ℹ tests 167
ℹ pass 163
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 24534.3033

node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/*.test.mjs
ℹ tests 1232
ℹ pass 1214
ℹ fail 17
ℹ cancelled 0
ℹ skipped 1
ℹ duration_ms 167541.2652
```

办公室基线本轮重跑161项（157通过/4失败），候选167项（163通过/4失败）。全量基线引用已绑定345cd39的OF-R2原始测试（1226项/1208通过/17失败/1跳过），候选本轮实跑；最终品牌几何断言和清单登记后再跑全量。两组按完整失败名称比较，新增失败、消失失败均为空。没有放宽既有断言。全量采用1GiB、单并发、单文件60秒限制。

7个改动/新增浏览器模块使用 `node --input-type=module --check < 文件.js` 全通过，`git diff --check` 通过。源码 MANIFEST 采用 canonical LF 更新/登记，没有新素材下载。

## 改动文件与行数

| 文件 | 增删 |
|---|---|
| `office3d/office-bar-geometry.js` | +4 / −2 |
| `office3d/office-vis2-preview.html` | +1 / −1 |
| `office3d/office-vis2/MANIFEST.json` | +9 / −2 |
| `office3d/office-vis2/bar.js` | +13 / −5 |
| `office3d/office-vis2/brand.js` | +2 / −1 |
| `office3d/office-vis2/preview.js` | +21 / −7 |
| `office3d/docs/v3-a2p-baseline-geometry.json` | 新增 903 行 |
| `office3d/docs/v3-a2p-integration.md` | 新增 24 行 |
| `office3d/office-vis2/align-fixture.js` | 新增 16 行 |
| `office3d/office-vis2/align-preview.js` | 新增 20 行 |
| `office3d/office-vis2/open-furnishing.js` | 新增 74 行 |
| `office3d/tests/office-v3-align-sample.test.mjs` | 新增 123 行 |

另新增本报告。备份及测量脚本外置，不提交临时图像。

## 没做到 / 未验证 / 后续接线

- 本卡没有接入 `LAYOUT_V3_ALIGN` 或主场景，没有改真实25工位、路线、热点、碰撞注册与业务对象。
- 新6m碰撞包络与真人通行、吧凳/沙发实际交互仍待V3-A1汇合后的路线验收；当前夹具仅视觉座位，不证明可坐或无穿模。
- 未修基线17项失败，均为范围外旧接线、缺历史备份/配置等；不把全量写成全绿。
- 未做长稳、生产数据或权限核查；没有部署或自批视觉验收。陈设密度、风格和兼容边界等待Q-V1复审。

范围外基线失败名称：

- `O4 app wiring stays within its own 20-line budget and layout1 data is identical`
- `O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines`
- `O6O7 production wiring contains no business, network, warehouse or wall-clock reads`
- `all pre-S2-1 data exports except the intentional minimap change are byte-equivalent`
- `app wiring stays minimal and does not add unsafe APIs`
- `campus app wiring remains limited and local-only`
- `control room implementation stays local, simulated and disposable`
- `display flag requires literal true, invalid/missing JSON stays off, URL opt-in is explicit`
- `only literal boolean true enables config; missing, damaged and other types fail closed`
- `server wiring adds town api after access control without changing static whitelist`
- `server wiring exposes platform tenancy only to local users and keeps static whitelist unchanged`
- `tests\office-layout-v2.test.mjs`
- `tests\state-last-good.test.mjs`
- `tests\town-map.test.mjs`
- `tests\warehouse-env.test.mjs`
- `town markers stay visible and navigable independently of town-nav switch`
- `town navigation switch fails closed and emits only a boolean client config`
