# S1-3-foyer-scene-build：把前厅与 DR 广场搭进 3D 场景（静态、可碰撞）+ 拆除旧接待台与绕行逻辑

**建议执行者：Codex 5.6 Sol（空间推理 / 三维碰撞 / 渲染预算）。** 先读 `_common.md`，再读 `docs/foyer-plaza-plan.md`（**这是规格**：第 0、1.1–1.4、2、3、5、6、7 节）、`office-layout.js` 里 S1-1 新增的 `FOYER_ZONES / FOYER_ITEMS / FOYER_TARGETS / FOYER_QUEUES / FOYER_RECEPTION / CENTRAL_CIRCLE / MAIN_AISLE`（**坐标的唯一事实来源，场景里不要再写一份数字，一律从它读**），以及 `quality.js`、`merge.js`（静态合并与 `userData.dynamic` 约定）。

**例外规则：** 本任务是 `app.js` 在 S1 阶段的**唯一编辑者**（S1-5 会接着改，所以此刻**不得与 S1-4 / S1-5 / M1 系列以外之外的任何改 `app.js` 的任务同时进行**）。允许修改：`app.js`、`office-layout.js`（**只限第 3 节的删除与调整**）、`tests/office-layout.test.mjs`、`tests/pedestrian-stress.test.mjs`（只限第 3 节）、新增 `tests/foyer-scene.test.mjs`、`docs/foyer-plaza-checks.mjs`（可扩充）、`README.md`。**不要改**：`server.mjs`、`ui.js`、`index.html`、`director.js`、`quality.js`、`merge.js`（需要时只读）、`env.js`、所有业务模块、Telegram / 密钥、`town\`、`town*.js`。备份 `app.js`、`office-layout.js`、两个测试到 `office3d-backup-s1-3`（办公室目录没有 Git）。纯前端改动，**不需要重启服务**；**验证时不得向 Paperclip 发任何写请求**，不新增依赖、不下载素材、不联网。

## 本任务的边界（很重要）
- **只做静态场景和碰撞**：地面、柜台、机器、摊位、桌椅、长椅、花坛、路灯、公告墙/接待台/交办箱的**外壳和静态贴图**。**动态内容（出勤数字、待办、晨会、里程碑、公告文字、访客人数、等候人物）不做，属于 S1-5**：公告墙和接待台背后的面板此刻只放**固定占位贴图**（例如「公告 · 暂无」「今日出勤」字样的静态 Canvas），并**给这些面板留下明确的挂载点**（命名成 `foyer-panel-attendance`、`foyer-panel-notice`、`foyer-panel-handoff` 这类，`userData.dynamic = true`），S1-5 直接替换贴图即可。
- **不做路径与排队的运行时接线**（S1-4）。不得让任何人物走向消费点；不写余额、扣款或「购买成功」之类的假状态（规划第 7 节第 6 条：A1/A2/B0–B3 此阶段只是装饰和可达点）。
- **不放任何会误导的真实品牌 / 价格牌**。咖啡吧、售货机、摊位只用中性的颜色和几何，不写虚构的价目，不写「已营业」。

## 要做的事
### 1. 搭建规划里的全部摆件
- 数据来源：`FOYER_ITEMS` 的每一项（共 27 项；其中 `lounge_*` 三项是**已存在**的休息区，**保持原样不重做**，只确认没被新东西压到）。**摆件的位置、尺寸、朝向、是否阻挡地面（`blocksFloor`）都从常量读取**，实体的外接矩形必须**落在规划矩形之内**（规划第 7 节第 1、2 条：GLB 超出就缩模型或删装饰，**不移动通道、不移动摊位坐标**）。
- 资产：优先复用现有家具 GLB（桌 / 圆椅 / 沙发 / 茶几 / 盆栽 / 书柜 / 落地灯 / 垃圾桶 / 衣帽架 / 音箱 …）；**没有的模型**（咖啡机、售货机、咖啡车、市集摊位、自行车架、公告墙、室外长椅）按规划第 0 节用**程序生成的箱体 / 圆柱 / 平面 + Canvas 贴图**。
- 前厅地面分区（规划 1.1 的 12 个分区）：同材质平面合并，分区字样合成**一张** Canvas atlas；分区标识要克制（不要盖住主通道的欢迎地毯和现有 `接待前厅 · RECEPTION` 地面）；**`MAIN_AISLE`（x 0…4）和门洞内、`CENTRAL_CIRCLE` 内不得有任何 `blocksFloor` 物体，也不得有会被当成障碍的碰撞体**。
- 东侧接待台 `FOYER_RECEPTION`（8.5…14.5 × 8.5…9.5）、交办箱、壁挂公告 / 出勤墙（`blocksFloor:false`，**不注册地面碰撞**）、等候沙发：按 `facing` 朝向摆放，面向主通道一侧的"正面"要读得出来。
- 广场：咖啡车 B0 + 2 张露天桌、3 个共用几何的市集摊位 B1–B3、2 组共 4 张长椅、自行车架、东西两盏路灯、南侧东西花坛。**重复件必须用 `InstancedMesh` 或共享几何 / 材质**（规划第 5.2 节），低档下按 `quality.js` 的现有规则降级（去掉小装饰、新增局部灯；不要新增会让光源总数上升的灯，路灯用**无光自发光材质**表现）。
- **全部新实体要正确标 `userData.dynamic`**：会被 S1-5 换贴图的面板标 `true`，其余静态件保持默认，让 `mergeStatic` 能合并它们；**每个摆件的 Group 命名成 `foyer-<itemId>`**，便于测试和调试查找。

### 2. 碰撞注册
- 所有 `blocksFloor !== false` 的实体用现有 `furnitureCollision.add(group, name)` 注册（**沿用真实三角面碰撞，不改碰撞算法**）。`name` 用 `foyer-<itemId>`，如果 `createFurnitureCollision` 对名字有白名单 / 正则，按它的约定接入，**不修改 `furnitureCollision` 本身**；需要改才能接入时，停下来在汇报里说明，不要自己改。
- 壁挂公告墙、路灯灯头、悬挂物、地面贴图 **不得进入地面碰撞**。

### 3. 拆除旧接待台与绕行（原 S1-1 刻意推迟到本任务）
S1-1 为了不让人物穿过还摆在走道里的旧前台，把下面这些原样保留；**本任务在搭好新前厅的同时删除它们**：
1. `app.js`：删除 `entrance-reception` 前台组（约 573–606 行的 `new THREE.Group()`、`reception-brand-logo`、`receptionCounter` 碰撞注册及其部件），**从 `furnitureCollision` 一并注销**；`x=0…4, z=3.8…16` 恢复为直通走道。**迎宾标语 `entrance-slogan`、欢迎地毯、后方形象墙 / Logo 如果原本依附在旧前台上，要保留成独立物体，不要丢**（先读代码，列出哪些是旧前台的部件、哪些要保留，写进汇报）。品牌 Logo 要重新放在东侧接待台的背墙或接待台正面。
2. `office-layout.js`：把 `RECEPTION` 改成东侧接待台边界（等于 `FOYER_RECEPTION` 的值），**删除 `bypassX` 字段和 `corridorPath()` 里的绕行分支**，让路径恢复普通直线；保持 `corridorPath`、`officeExit`、`loungeTrip`、`meetingTrip` 的其余输出不变。`app.js` 里 `import { …, RECEPTION, … }` 的用法按需调整（若不再使用就从导入里去掉）。
3. `tests/office-layout.test.mjs`：把「中轴接待台必须绕行」类断言改成「中轴直通：`x=0…4, z=3.8…16` 上的路径不含 `x=-2` 绕行点」，**不得放宽其它断言**。
4. `tests/pedestrian-stress.test.mjs`：模拟前台碰撞体改到东侧（`x 8.5…14.5, z 8.5…9.5`）；**T16 历史回归种子（含 53 / 81 / 91 / 161）继续全跑并全绿**，200 个种子的口径不变。

### 4. 视觉与相机检查（规划第 7 节三处最不确定的点，要实际看）
- 用真实相机逐个检查：**B0 咖啡车、东侧路灯、3 个摊位**与 `env.js` 生成的远景树 / 路灯是否视觉重叠或被遮挡。**优先移动装饰路灯（只动本任务新增的路灯），摊位坐标保持不动**；`env.js` 不得修改，如果必须改，停下来汇报。
- 检查 GLB 缩放后的包围盒是否真的落在规划矩形内（写一个脚本 / 测试遍历所有 `foyer-*` 实体，断言其世界包围盒在对应 `FOYER_ITEMS` 的矩形内，允许 0.05 米误差）。
- 前厅只有 5 米深，**细小装饰只占墙面，不得吃掉排队深度**（`FOYER_QUEUES` 的 42 个点附近 0.5 米内不得有 `blocksFloor` 物体）。

### 5. 渲染预算（验收口径：同机位、同画质、同人物状态，实施后减实施前）
- 基线（规划 5.1，2026-10-20）：DR 广场机位 `az=8, el=34, r=20, target=(2,0,23)` 高画质 calls **1133** / 616,687 三角形 / 18 灯；全景 **1797**。**本任务开工前先在你自己的环境里重新测一次基线，写进汇报。**
- 目标：**高档增量 ≤ +45 calls、低档 ≤ +12 calls**（规划第 7 节推荐值），**硬上限 高 +60 / 低 +15，超过即不通过**；光源总数不增加；等首轮 `/state` 之后的 2.5 秒静态合并完成再读 `renderer.info.render.calls`。同时报告三角形数的增量。

## 测试（`tests/foyer-scene.test.mjs` + 扩充 `docs/foyer-plaza-checks.mjs`）
`app.js` 依赖浏览器，所以把可单测的部分拆成**不依赖 THREE / DOM 的纯数据与检查函数**（例如 `foyer-scene-spec.js`：由 `FOYER_ITEMS` 生成「每项应有的实体名、碰撞注册与否、dynamic 标记」清单；本任务允许新增这一个文件，需在汇报里列出），然后测：
- 27 项 → 实体清单一一对应；`blocksFloor:false` 的不在碰撞清单里，其它都在；`MAIN_AISLE`、门洞、`CENTRAL_CIRCLE` 内没有碰撞实体；`foyer-panel-*` 都标 dynamic。
- `RECEPTION` 与 `FOYER_RECEPTION` 一致；`bypassX` 已删除；`corridorPath` 不再产生 `x=-2` 绕行点（对 25 个 home 全测）；`officeExit / loungeTrip / meetingTrip` 的输出与改动前逐点一致（用备份里的旧实现对比，或保存的旧结果快照）。
- 静态检查：`app.js` 里不再引用 `receptionCounter`；新增代码没有 `innerHTML` 拼接外部数据；没有联网；没有写死的第二份坐标（可以检查 `foyer` 相关代码引用了 `FOYER_ITEMS` 而不是字面量矩形）。
- 浏览器侧的 3D 校验（遍历 `foyer-*` 实体包围盒、碰撞注册数量、`renderer.info`）写成可粘贴到控制台运行的 snippet 放进 `docs/`，并把输出贴进汇报。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（**不得放宽已有断言**，特别是 T16 的 200 种子压力测试、`office-layout`、行人动线测试、`foyer-layout`）；`node --input-type=module --check < app.js`、`< office-layout.js`；`node docs/foyer-plaza-checks.mjs` 全 PASS。
- **浏览器实测**（`http://office.localhost:3200/`，Ctrl+F5）：
  1. 截图：前厅（俯视 + 一张贴近视角）、DR 广场整体（含 B0 / 三个摊位 / 长椅 / 路灯）、主走道直通（旧前台已不在）、小地图；
  2. 人物实测：在前厅与走道处观察 / 让一位同事走一遍上班路线，确认**没有穿墙、没有被新家具卡住、不再绕旧前台**；T16 的看门狗在 3 分钟内 0 次 `行动超时`；
  3. 画质切换（高 / 中 / 低）各看一眼，低档下新增装饰按规则降级；报告三档 calls 增量与基线对比；
  4. 控制台 **0 错误**（`THREE.WebGLProgram` 的 X4122 已知警告不算，但要列出）；
  5. 搜索框输入「咖啡」「接待」仍能找到并跳转；`wallGo` 各 key、区域按钮不受影响。
- 汇报（按 `_common.md` §5）：每条做到没有；没做到的原因；**旧前台哪些部件被删、哪些被保留及理由**；实体清单与包围盒校验结果；基线 / 增量 calls 与三角形；视觉冲突（`env.js` 树 / 路灯）的检查结果和你做的移动；**任何超出规划矩形或不得不推导的地方**；未验证项如实写。
- **不要自己结束或重启进程；不改 `server.mjs`。**
