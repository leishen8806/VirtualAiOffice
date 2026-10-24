# OF-R2：广场绿化与暖色材质候选回执

## 基线与结论

- 执行分支：`integration/office-evidence-20261023`。
- B0：`66bca480e580efb92300f2d955231889751cf7be`；开工工作区干净。按 `dispatch/codex` 的 OF-R2 卡追加提交，无合并、改写历史、服务操作或部署。
- 候选版本：本报告所在提交；推送后完整 SHA 绑定外置 `OF-R2/evidence-manifest.json`。不把本地运行目录或在线服务当作版本证明。
- 当前状态：实现、自测和浏览器取证完成，等待 Q-V1 独立复审；不是自批验收。

## 做到

1. 原 18 个设施保留；新增左右各 4 棵乔木和前沿左右各 2 段弧形花境。复用已登记 `office-plaza-props.js` 的乔木几何，私有副本使用自然绿色与灰褐树干；不下载素材。弧形花境为原创静态程序化几何。
2. 所有新增构件的真实顶点包围盒与三角形数均导出到 placements。高、低档都检查与原设施、4m 中轴、广场圆盘及 0.28m 行人余量不相交；原工位、导航和布局数据不变。既有私有宿主按原机制注册 30 个占地体（原 18 + 新 12），没有修改共享碰撞代码。
3. 新弧形花境替代其正下方 4 个矩形绿化格，避免穿插；其余矩形绿化从 91 格保留 87 格。completion 原来单独重复的 4 棵预览树移除，改为使用同一套 8 棵广场树。
4. 铺地、地面、基座与顶带使用暖米/浅木颜色；私有无贴图石面保留细纹理，已有贴图绑定与资源释放机制保留。没有改曝光、灯光、renderer、共享加载器或业务请求。
5. 广场构件继续合入已有一个材质批次；低档减叶片和弧线段数。completion 新增真实 `plazaTriangles` 统计，断言其低档几何与直接构造低档广场相等。
6. 共享伞盖提交 `c03540ae3ca736509703fd110a8d5db32165299d` 不是 B0 的祖先，保留私有翻转；新增实际向下射线检查伞顶高于裙边。未合并仓配分支。
7. 仅修改允许范围，MANIFEST 的源码 SHA-256 按 canonical LF 更新；实际贴图、商标素材与 25 个业务工位映射不变。

## 量化与真实浏览器证据

环境：Windows，Headless Chromium 156，NVIDIA GeForce RTX 5070 Ti / ANGLE D3D11；1920×1080，DPR=1；使用项目既有 high / low 画质。参考图从 Git 对象读取，1055×1491，SHA-256 前缀 `97f74fff`。

浏览器以拦截映射读取本工作树静态文件；B0 对照仅将本卡改动模块映射为开工备份。`/state` 始终返回空夹具（agents=[]、world=null）；其他业务接口 404，非 GET 与外部请求拦截。没有请求真实业务数据，没有开服务。沿用既有页面轮询调用，未删除轮询以制造“零请求”。

固定午间/天气夹具与装饰随机 seed=812，关闭取证时的镜头巡游和动作更新；这些只在隔离浏览器执行，不写项目配置。不调整全局曝光、灯光或色调映射。截图隐藏 UI，保留真实 Three.js 渲染。

| 检查 | B0 | 候选 | 卡片要求 / 结果 |
|---|---:|---:|---|
| plaza 地面平均 R−B | 3.164 | 34.743 | ≥15，达到 |
| plaza 地面亮度 | 0.8163 | 0.7871 | 0.70–0.88，达到 |
| overview 室内地面 R−B | 4.822 | 34.917 | ≥10，达到 |
| 高档 overview calls | 133 | 133 | +0 ≤3 |
| 高档 overview 三角形 | 262,479 | 283,695 | +21,216 / +8.08% ≤15% |
| 低档 overview calls | 61 | 61 | +0 |
| 低档 overview 三角形 | 96,551 | 98,759 | 低于高档 |
| 广场几何（高 / 低） | 9,328 / 3,552 | 21,056 / 6,352 | 低档实减 |
| 新乔木 / 弧形花境 | 0 / 0 | 8 / 4 | 数量与占地断言通过 |

颜色计算固定 ROI：plaza `[800,400,1120,550]`，overview `[850,535,1040,595]`；左上原点，矩形右下为开区间，不按颜色筛选像素。亮度采用截图 sRGB 数值的归一化加权平均 `(0.2126R+0.7152G+0.0722B)/255`，不是物理光度。

样板关闭的 before/after：overview 仅 26/2,073,600 像素有差异，最大通道差 3/255；drlife 仅 5 像素差 1/255；plaza、前厅逐像素完全一致。未将低于噪声的差异写成零差。

短时采样中高档 overview 帧时间 B0 16.67ms、候选 18.15ms，低档约 33.33ms（既有帧率限制）；高档首帧 B0 4.13s、候选 3.98s。一次冷启动读数不代表稳定提速或长稳性能结论。高档资源计数分别为 93/89 几何、46/46 纹理，后续视角读取仍有既有异步资源变化，不能据此声称释放了 4 个资源或无泄漏。新增绿化自身仍共用 1 个几何/材质批次，不增加纹理请求；完整原始值留在 browser JSON。

相机（az/el/r/target）：

- overview：`0 / 58 / 78 / [2,0,2]`，真实 `wallGo('overview')`。
- plaza：`6 / 36 / 20 / [2,0,23]`，真实 `wallGo('plaza')`。
- drlife：`6 / 36 / 20 / [14,0,4]`，真实 `wallGo('drlife')`。
- 前厅：`6 / 36 / 24 / [2,0,8]`，当前 wallGo 无 foyer 分支，按既有前厅焦点调用 setGoal，不改应用代码。
- 补充广场全景：`0 / 50 / 40 / [2,0,21]`，用于看完整乔木列与四段花境，不替代上述验收机位。

外置工件集标识：`review-artifacts/OF-R2`，未推入源码历史、未发布到远程公共存储。独立审查者需访问该本地工件集；提交 SHA 与文件哈希记录在 evidence-manifest.json。

- 主截图：`seeded-{before,after}-high-{overview,plaza,drlife,foyer}.png`。
- 关闭与低档对照：`seeded-{before,after}-{closed,low}-{overview,plaza,drlife,foyer}.png`。
- 补充：`seeded-{before,after}-wide-plaza.png`。
- 原始记录：`browser-high-seeded.json`、`browser-modes-seeded.json`、`pixel-measurements.json`、`closed-diff.json`、`geometry.json`、测试日志与 `test-comparison.json`。
- 未固定装饰 seed 的初次截图/读数保留为探索记录，最终量化以上述 seeded 成对工件为准。所有页面取证后已离场，拦截规则已清理。

## 占地映射

共享 LAYOUT_V3 未改。乔木中心：左列 x=-14、右列 x=18，各列 z=15/19/23/27；复用尺寸缩放 `[0.65,0.85,0.65]`，完整树冠也纳入不重叠检查。弧形花境中心沿用广场 `[2,21]`，内/外半径 11.05/11.55；前向角度为左右各 17–24°、27–35°，与原有 4m 中轴分离。矩形绿化替换中心：x=-5.1/-2.7/6.9/9.3、z=31.25。每个高低档的实际 bounds、triangles 见 geometry.json，运行时 placements 同样可读。

## 测试与 P3 变异

本轮先实跑 B0 办公室测试，再跑候选。全量 B0 对照使用已绑定 66bca48 的 OF-R1 全量原始日志（本轮未重复全量 B0），候选全量本轮实际运行；按完整失败名称比较。

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-of-r1.test.mjs tests/office-of-r2.test.mjs tests/office-vis2.test.mjs
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1852.0724

node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs
ℹ tests 161
ℹ suites 0
ℹ pass 157
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 23595.495

node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/*.test.mjs
ℹ tests 1226
ℹ suites 0
ℹ pass 1208
ℹ fail 17
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 148047.0668
```

全量运行前空闲内存约 4.0GiB，单并发、Node 1GiB 上限、单测试文件 60s 超时。修改的 5 个浏览器模块全部使用 `node --input-type=module --check < 文件.js` 检查；`git diff --check` 通过。最后仅修改注释与对应 manifest hash，再跑专项 27 项通过，未改变浏览器已取证的运行逻辑。

真实变异：只去掉 completion 调用 appendOfficePlaza 时的 low 参数，运行 `tests/office-of-r1.test.mjs`；恢复原文件后专项再通过。没有把变异保留在交付代码。

```text
MUTATION KILLED: completion no longer forwards low; exit 1
AssertionError [ERR_ASSERTION]: completion forwards its quality tier to actual plaza geometry
actual: 21056
expected: 6352
operator: 'strictEqual'
ℹ tests 3
ℹ pass 2
ℹ fail 1
ℹ duration_ms 746.8678
```

原 18 设施的 10,000 三角形断言保留（从总数扣除新增绿化后检查）；没有放宽它来容纳新增构件。新增内容受主场景 ≤15% 增量及数量、占地、真实低档几何断言约束。既有数量断言随明确新增的 12 构件从 18 更新到 30；其余断言未放宽。

## 文件与行数

| 文件 | 增 / 删行 |
|---|---|
| `office3d/office-vis2/MANIFEST.json` | +5 / −5 |
| `office3d/office-vis2/batch.js` | +3 / −0 |
| `office3d/office-vis2/completion.js` | +4 / −10 |
| `office3d/office-vis2/plaza.js` | +43 / −3 |
| `office3d/office-vis2/shell-finish.js` | +7 / −3 |
| `office3d/office-vis2/whole-floor.js` | +7 / −3 |
| `office3d/tests/office-of-r1.test.mjs` | +3 / −2 |
| `office3d/tests/office-vis2.test.mjs` | +2 / −1 |
| `office3d/tests/office-of-r2.test.mjs` | 新增 49 行 |

另新增本回执 `dispatch/codex/outbox/OF-R2-report.md`。基线备份、图像和测量脚本均外置，不提交大图或参考图。

## 没做到 / 未验证 / 范围外

- 没有把既有测试全修绿：办公室 4 项、全量 17 项失败均与基线名称一致，新增失败集合为空。它们涉及旧接线预算、缺少历史备份/配置、仓配及服务端断言，超出本卡范围，未改断言绕过。
- 未读取真实业务状态；多人实际行走、生产数据、权限及跨公司路径未在浏览器中验证。25 工位对应导演到达/离开纯夹具回归通过，不等于多人现场无碰撞证明。
- 未做长时间性能/内存稳定性测试；上述为固定环境的短时浏览器测量。
- 本卡完成 G4/G5 的限定修正，不代表整楼格局与概念图 1:1 已通过。广场乔木继续使用已登记程序化资产；概念图最终相似度和效果由 Q-V1 目视复审。
- 没有修改 app.js、布局、共享家具/碰撞、仓配、导航或业务模块；没有新增业务请求、服务实例、外部下载或运行时 AI 调用。

全量基线遗留失败（名称）：

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
