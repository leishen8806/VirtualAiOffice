# OF-R1 交付回执

## 版本与结论

- 工作分支：`integration/office-evidence-20261023`。
- 本轮基线：`1bf9ec9372b73fccc0e50fc6730689c0b3a420f0`。
- 合并父提交：O-06 FIX3 `0c266d54ba74c39cf5a47f7e124665221fb7ae0d`。
- 候选版本为包含本报告的合并提交；推送回执及外部证据清单记录完整 SHA。不改写已审提交。
- 结论：卡内修复及验证完成，等待 Q-V1 独立复审。**全量并非全绿：17 项既有失败保持，新增失败 0。**

## 做到

1. 以 merge 方式纳入 FIX2/FIX3 导航合同，同时保留本分支已完成的视觉与家具绕行。未改 V2/V3 的 25 个工位名称、坐标、朝向、房间区域或业务映射。
2. `director.js` 只捕获本地明确的 `FurnitureBlockedError`；导航或碰撞服务抛出的 TypeError 等异常继续抛出。保留 `navigation` 注入、`boardTrip`、到点即入队及 `invalidRoute` 一次性回收。
3. 原 FIX3 的 11 项测试原样纳入、全部通过；新增 25 个工位实际调用导演逐个上班/下班并完成、零导演警告的测试，以及异常分类、广场高低档与清理验证。
4. 在 `office3d/docs/office-sample-integration.md` 新增当前两层开关说明：`layout=3` 的基础家具/导航变化与 `officeSample=1` 的美术样板变化不同。历史报告保留为历史。
5. `low` 从 completion 和主场景 plaza host 两条入口传到 `appendOfficePlaza`，再传给 `buildOfficePlazaProps`。低档共享原型是 InstancedMesh，逐实例展开矩阵与颜色后合并，避免只烘焙一个原点方块。花带从 24×5 减为 12×3 叶片。
6. 已登记源码的 SHA-256 按原有 canonical LF 规则更新；未放宽任何已有断言。

## 合并冲突与逐段取舍

| 文件/段落 | 处理 |
| --- | --- |
| `app.js` 冲突 | 保留本分支 `furniture3.board`、boss 与样板董事会人物接线；最终相对 B0 **零改动**。 |
| `director.js` 工厂 | 采用 FIX3 可注入 navigation，并解构完整 boardTrip。 |
| `director.js` pathTo | 去掉本分支强制 V3 都走 officeTrip 的捷径；董事会事件优先采用 FIX3 boardTrip，V1/V2 旧回退保留。 |
| `director.js` furnitureRoute/上下班/travel/事件 | 保留现分支家具避让、椅子忽略集、入口排队；仅无可用家具路径时抛专用错误并受控拒绝，程序异常不吞。 |
| `director.js` moveVisit | 采用 FIX3：已到点直接进入 queued；移动拒绝则 invalidRoute 回收一次；不会逐帧重试。 |
| `director.js` validRoute | 自动合并产生重复函数，保留一份原有完整校验。 |
| `office-layout.js` 自动合并 | Git 未标冲突，但拼接出了两套同名 V3 导航函数，已人工合成一套。没有改布局数据声明。 |
| `office-layout.js` officeExit/standAt/publicPath | 保留当前工位侧向/椅后出入点、对话站位及公共通道图；保留禁止普通路线绕过南门的校验。 |
| `office-layout.js` entrance/board/consumer | 采用 FIX3 完整入口与董事会门对象、注册目标 ID、队列槽位、前移/离开合同；广场目标经南门外连接段进入。 |
| `office-layout.js` meeting/lounge | 室外段复用公共通道图；会议末段保留 FIX3 门内与桌侧走廊；休息路线经对应东西吧台开口进入。 |
| `office-v2-modules.js` createWaitingBoard/waitingPlan | 采用 FIX3 V3 分支，使用同一 navigation.consumerQueues；V1/V2 旧逻辑保留。 |
| `office-v3-meeting-navigation.test.mjs` add/add | 完整采用 FIX3 的 11 项，不删改断言。本卡新增测试另放 `office-of-r1.test.mjs`。 |
| 其它传入历史文件 | 该父分支含仓配、DeepSeek 报告、历史图片等祖先变更；按本卡范围保留 B0 文件树，不将这些无关文件带入候选树。父提交历史通过 merge 可追溯，没有删除或改写远端历史。共享家具最终也与 B0 一致。 |

## 两个行为信号

### 休息区 endpoint blocked

原分支公共规划把整座岛台圆盘排除；东侧会议通道到岛内接近点 `(6.7,-6)` 被作为公共路径终点，触发 endpoint blocked。休息席不是普通公共通道点。

现在 `loungeTrip` 将公共段接到岛外，再沿 FIX3 指定的东西开口进入。150 组休息路线与 1,375 条完整路线矩阵均通过，覆盖吧台、树池、前台和实墙。`corridorPath` 仍保留 FIX3 岛内终段合同及旧直达碰撞反例；不能把通用 corridorPath 当安全休息路线，实际休息调用必须使用 loungeTrip，并由家具碰撞服务复核。

### 访客 undefined desk

原适配器缺少 FIX3 的 consumerQueues，consumerTrip 也只接受坐标，和 FIX3 的目标 ID/槽位合同不兼容；V3 等候规划还借用旧版规划。现在补齐目标、槽位、V3 等候专用适配及导演队列状态。真实导演双访客按序前移、离开、坏路线只告警一次的测试通过。

## 测试

工作目录均为仓库内 `office3d`，未连接生产写接口、未读取生产配置补夹具。运行前可用内存约 13 GB；全量按单并发、1 GB 堆上限运行。

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs tests/director*.test.mjs
tests 159
pass 155
fail 4
cancelled 0
skipped 0
duration_ms 24254.1692

node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/*.test.mjs
tests 1224
pass 1206
fail 17
cancelled 0
skipped 1
duration_ms 152931.8233
```

定向 B0 本轮先实跑：149 项，145 过、4 失败。候选增加 10 个通过项（FIX3 增加 7，本卡增加 3），失败名称集合完全相同。全量对照 B0 已留存的完整执行日志：1214/1196/17/1；候选 1224/1206/17/1，失败名称集合完全相同。全量 B0 日志来自此前固定 B0 执行，本轮未另跑一次全量 B0。

四个定向既有失败：

- `O4 app wiring stays within its own 20-line budget and layout1 data is identical`
- `O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines`
- `O6O7 production wiring contains no business, network, warehouse or wall-clock reads`
- `tests/office-layout-v2.test.mjs`

其余 13 个全量既有失败按名称见工件 `test-comparison.json`；原因仍为历史备份/运行配置缺失及范围外中控合同等，没有删除或跳过它们。首次全量额外发现工作树换行被规范化而触发旧源码前缀断言；恢复 `office-layout.js` 原 CRLF 后该 8 项测试通过，最终全量已重新执行，保留首次日志。

浏览器 JS 逐个通过 `node --input-type=module --check < 文件.js`：director、office-layout、office-v2-modules、plaza、plaza-host、completion。V1 数据与函数文本（仅统一换行）、V2/V3 seats/regions 对 B0 一致，原始结果在 `layout-data-check.json`。

## 浏览器与资源证据

Windows / Chromium 155，1920×1080，DPR 1。通过既有验收工具将固定基线/候选静态文件映射到现有页面；没有启动新服务，没有将候选部署到运行服务。业务 GET 保留，非 GET 被验收拦截器禁止。

相机固定：az=0°、el=48°、r=82、target=(2,0,4)；固定正午与天气。人物隐藏用于静态几何配对，不能当作行走性能证明。每档连续 10 次切换 office3-root 可见性取精确增量，截图同机位。

| 状态 | B0 总 calls/三角形 | 候选总 calls/三角形 | B0→候选 root 增量 calls/三角形 |
| --- | --- | --- | --- |
| layout=3，样板关闭，高档 | 125 / 114359 | 125 / 114359 | 30/80802 → 30/80802 |
| layout=3，样板关闭，低档 | 66 / 50185 | 66 / 50185 | 7/30517 → 7/30517 |
| layout=3，样板开启，高档 | 144 / 246515 | 144 / 246515 | 49/212958 → 49/212958 |
| layout=3，样板开启，低档 | 76 / 104441 | 76 / 98665 | 18/86379 → 18/80603 |

静态构件：广场单模块高档 9328、低档 3552 三角形；completion 高档 18012、低档 9084。18 个设施 ID 保持，碰撞注册及销毁检查通过。实际主场景碰撞仍为 197 bodies / 19756 triangles。

候选渲染间隔中位/P95（ms）：样板关闭高档 16.6/17.0、低档 33.3/33.5；样板开启高档 16.7/18.2、低档 33.4/36.5。只是短时采样，不承诺全员或长期性能。

页面错误 0。加载的 25 个真实人物分别建立 arrive/goHome 路线，25/25 成功，导演警告 0；该浏览器探针在移动前 clear，**没有证明完整行走无穿模**。逐个完成上下班由实际导演自动化测试验证，模型为测试替身。

外部工件集标识：`OF-R1`。截图为 `before/after-{default/sample}-{high/low}-overview.png` 共 8 张；另含 `browser-results.json`、`browser-commute-start.json`、`test-comparison.json`、测试原始日志与 `evidence-manifest.json`。清单绑定候选完整 SHA、文件摘要、环境、相机。截图未加入 Git；未发布公开工件服务，独立复审需另行取得此工件集，仅拉取代码不会得到截图。

## 没做到 / 未验证 / 待协调

- 既有 17 项全量失败未修，不宣称全量全绿。
- 共享 `office-plaza-props.js` 仍有向上开口伞盖，W-V1-R2 修正未进入本候选基线，私有高档翻转暂保留；共享修正合入时须同时删除私有翻转，防止翻回去。本轮未改共享文件或拉入仓配修正。
- 未做完整真实人物上下班录像、长时间多人碰撞、生产服务切换、业务写操作或治理流程验收；本轮不宣称整楼视觉 1:1 达标。
- 未修改 app/ui/index、业务服务、权限、仓配和二维中控；未部署、重启、合入 main 或自批通过。
- 完成推送后停止，等待 Q-V1 复审。

## 改动文件与行数

相对 B0 的新增/删除行数（本报告自计不含）：

| 文件 | + / - |
| --- | --- |
| office3d/director.js | 23 / 11 |
| office3d/office-layout.js | 77 / 37 |
| office3d/office-v2-modules.js | 12 / 1 |
| office3d/office-vis2/MANIFEST.json | 2 / 2 |
| office3d/office-vis2/completion.js | 1 / 1 |
| office3d/office-vis2/plaza-host.js | 2 / 2 |
| office3d/office-vis2/plaza.js | 13 / 6 |
| office3d/tests/office-v3-meeting-navigation.test.mjs | 246 / 0 |
| office3d/tests/office-of-r1.test.mjs | 93 / 0 |
| office3d/docs/office-sample-integration.md | 17 / 0 |
| office3d/docs/vis3-m1-o06-navigation-contract.md | 38 / 0 |

`office-v3-public-path.js`、`office-v3-modules.js`、`app.js` 和共享家具相对 B0 未变。
