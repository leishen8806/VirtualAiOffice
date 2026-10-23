# VIS2-W · A：高位货架 + 轨道式托盘穿梭机 + 托盘货物（组件级样板，尚未正式接入）

**状态：** 组件预览与自测完成；**不是仓配验收通过**。分支 `vis2w/rack-cell-a`（基线：快照分支 `office3d/rev-20261023-2` @ `cbddb9f`，origin `git@github.com:leishen8806/VirtualAiOffice.git`）。

## 一、交付内容（A 的提交只含这四个文件）
| 文件 | 作用 |
|---|---|
| `dr-vis2-rack-cell.js` | 私有构件：`buildVis2RackCell({ THREE, root, layout, quality, seed })` → `{ group, summary, setShuttle, dispose }`；导出 `VIS2_COLORS / VIS2_DIMENSIONS / VIS2_REPLACES` |
| `dr-vis2-rack-cell-preview.html` | 隔离预览（页首与标题标明「组件预览，尚未正式接入」；地面与灯光为预览夹具，不属于构件；预览自带极简轨道控制，未引入 OrbitControls）。用法：在 `office3d` 目录起任意静态服务器后打开 `/dr-vis2-rack-cell-preview.html` |
| `tests/dr-vis2-rack-cell.test.mjs` | 10 个用例（见第四节） |
| `docs/dr-vis2-rack-cell.md` | 本文 |

**素材与来源：** 无外部素材、无贴图、无下载；全部为程序化几何（实例化盒体 + 一个合并网格）。穿梭机为原创低矮轨道车，**不是**叉车或载人机器人；`asset-intake/gpt-reference/campus` 的穿梭机四视图只作外观参考，图片不是三维模型。

## 二、造型与尺寸（米）
- **货架（取自 `createCampusRackPlan` 的四行 A1/R2/C2/B2 与各 6 个货位，ID 稳定）：** 单深选择式货架，框架进深 1.1 m 居中于 2 m 占地内；立柱 0.1×4.4 m **#2F6FA8**、框架横撑与斜撑同色；横梁 4 道（0.2 / 1.5 / 2.8 / 4.1 m）**#E8832A**，第 4 道只作顶梁不放货；每货位两个托盘，约 22% 空位。
- **托盘 + 货物：** 托盘 1.2×1.0×0.12（面板 + 3 根承梁，承梁垂直于横梁，托盘两端各悬出 0.125 m 搭在两条横梁上）；纸箱 2×2 每层、2–3 层，货高 ≤ 0.95 m；约 72% 的货物带半透明缠绕膜（独立实例批次，保持 0.28 透明度）。货顶最高 3.93 m，低于顶梁（4.1 m）与屋面（4.68 m）。
- **轨道 + 穿梭机：** 两条钢轨（间距 1.4 m，位于展示带中线两侧 ±0.7 m）、枕木每 0.8 m 一根、四个端部缓冲块；穿梭机低矮车体 1.7×0.28×1.1 m（离轨 0.26 m）、四个车轮压在轨道顶面（实测车轮底面 = 轨顶面）、侧面橙色识别条、两端黑色缓冲、顶部承托板上放一个托盘货物；合并为 1 个带顶点色的网格。
- **穿梭机位置：** 展示带 `CAMPUS_SHUTTLE_STRIP`（x −148…−144，z −8…6）内，默认停在中间货位 `slot-b`；`setShuttle({ z, lift })` 把位置夹在轨道行程内、抬升夹在 0…0.12，非有限值被忽略。**当前静态；运动由既有时钟驱动，本构件不自行计时。**

## 三、预算（构件自报；同一静态预览下）
| 画质 | draw calls | 三角形 | 实例（frame / pallet / carton / film / rail） |
|---|---|---|---|
| 高 | **6**（5 个实例批次 + 1 个穿梭机） | **25 144** | 444 / 436 / 1084 / 77 / 23 |
| 低 | 6 | **9 132** | 只建 2 行货架、3 层横梁、无缠绕膜与斜撑 |

接入 campus registry 后，不透明实例批次由 `mergeCampusStatic` 并入 `campus-opaque-batch-*`；缠绕膜与穿梭机标记为 dynamic，保持独立。**注意：这是组件自报的批次数；接入主场景后的真实增量（含 env.js RenderPass / GTAO 口径）需 Trae 在候选版本上成对测量。**

## 四、自测
`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/dr-vis2-rack-cell.test.mjs`：**10 / 10 通过**。覆盖：颜色只有两种批准的蓝与橙；所有构件落在 `highRack` 区内且低于屋面；托盘搭在横梁上、货物不碰上一层横梁、顶梁层无货；同层托盘不重叠；两条轨道位置与车轮触轨；穿梭机夹紧与非法输入；同种子逐字节一致、不同种子不同、低画质更轻；在真实 `createCampusRegistry` 里构建、缠绕膜不被合并成 .46 的批次、静态件被合并；`dispose` 幂等并释放自己拥有的几何与材质；源码不含 RAF / `Math.random` / `Date.now` / `fetch` / `innerHTML` / 渲染器 / 定时器。
全量套件（干净克隆）：**新增 0 个失败**（基线本来就有 20 个因缺本机运行数据而失败的用例，集合完全相同）。

## 五、旧对象替换清单（避免新旧叠在一起）
| 旧对象 | 处理 |
|---|---|
| `campus-racks-static`（`dr-campus-racks.js` 的 `buildCampusRacks`） | **其中的货架立柱 / 横梁 / 货物箱体**要停用。注意该实例化网格还混入了工位、月台门与穿梭机底座（`inside()`）——让旧模块跳过货架与货物、保留其余，不要整体删除 |
| `campus-shuttle`（`dr-campus-shuttle.js` 的车体与动态组） | 由本构件的 `vis2-shuttle` 替换；运动仍用既有 `shuttleFrame` 状态 |
| `campus-shuttle-static`（轨道、枕木） | 由本构件的 `vis2-rails` 替换 |
| `campus-rack-labels`（A1/R2/C2/B2 标签） | **保留**，本构件不画标签 |
| 仍共享的资源 | `CAMPUS_ZONES`、`CAMPUS_SHUTTLE_STRIP`、`createCampusRackPlan`、`shuttlePlan`（只读导入） |
| 热点 | `highRack` 区与货位 ID（`rack-A1-1…`）未变，热点**不需要重新映射**；若有指向 `campus-racks-static` 的拾取逻辑需改为指向 `vis2-rack-*` |

## 六、给 Trae 的最小接线说明（本构件不自行接线）
1. `dr-campus-modules.js` 在 `shell` 之后登记：`['vis2Rack', (context) => buildVis2RackCell(context)]`（context 已含 `THREE / root / layout / quality`）。
2. 旧 `buildCampusRacks` 增加「跳过货架与货物」的选项（或拆出站位与门的部分）；旧 `buildCampusShuttle` 在新构件存在时不建车体与轨道。
3. 穿梭机运动：在既有时钟回调里拿 `shuttleFrame(state, time)`（`position` 为 0…2 的货位序号，`lift` 为 0…0.12），映射为 `z = slots[0].z + position × (slots[1].z − slots[0].z)` 后调用 `cell.setShuttle({ z, lift })`；**不要新增 RAF**。
4. 关闭 / 离场：调用 `cell.dispose()`（幂等，只释放自己拥有的资源）。

## 七、临时参考 P0（B0 未出现时的依据）
未找到 Trae 发布的正式 B0 与接入契约。本构件只依据：① 本地 `origin` / `HEAD` / 工作树记录（见上）；② `office-layout.js` 的 `CAMPUS_ZONES / CAMPUS_SHUTTLE_STRIP`（与运行目录 `E:\VirtualAIOffice\paperclip-ops\office3d` 的同名文件逐字节核对一致）；③ `dr-campus-registry.js` 的 `factory({ THREE, root, layout, now, ...shared }) → { onFrame?, dispose?, summary? }` 契约与静态合并规则；④ 屋面高度 4.68 m（`dr-campus-shell.js`）。**P0 不是正式 B0，也不是验收候选。**

## 八、缺口（如实）
- 静态样板；穿梭机运动未接入既有时钟（只提供 `setShuttle`）。
- 只做了组件预览，**没有接入真实场景**，没有在真实仓配页面里同机位验证；与 Trae 的地面 / 屋面 / 外壳工作的视觉配合未验证。
- 缠绕膜为单层半透明盒体，近距离可见但不精细；货物只有一种箱型。
- 没有做 B（中控室 + 前厅内部），按任务分两个提交，B 之后单独交付。
