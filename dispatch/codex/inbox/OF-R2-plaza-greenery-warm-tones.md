---
id: OF-R2
base: integration/office-evidence-20261023 @ 66bca480e580efb92300f2d955231889751cf7be
branch: integration/office-evidence-20261023
scope:
  - office3d/office-vis2/
  - office3d/tests/office-vis2.test.mjs
  - office3d/tests/office-of-r1.test.mjs
  - office3d/tests/office-of-r2.test.mjs
  - office3d/docs/
  - dispatch/codex/outbox/OF-R2-report.md
budget: 4h
---
# OF-R2：广场绿化与整楼暖色调（办公室样板，`officeSample=1`）

在 `integration/office-evidence-20261023` 上从 `66bca48` **继续追加提交**，不改写已审提交、不 force push、不推 `main`。只改办公室样板私有模块（`office-vis2/`）与测试、文档；**不改** V3 布局、工位、导航、`app.js`、共享家具（格局对齐另有卡 V3-L1，由 Trae 先出方案）。

## Q-V1 结论

- OF-R1（`66bca48`）代码检查通过。
- 整楼浏览器视觉验收（`?layout=3`，样板关 / 开各 12 机位）：样板开启后暖木隔断、绿植花槽、吧台榕树、前厅、广场设施、工位细节都明显改善，叶片发黑已修。
- 与参考图（仓库 `main` 分支的 `docs/visuals/target-office.png`（《智序工场·办公区改造概念》，1055×1491，SHA-256 前缀 `97f74fff`；取用：`git show origin/main:docs/visuals/target-office.png > target-office.png`））相比，本卡负责其中两项：

| # | 参考图 | 当前 |
|---|---|---|
| G4 广场 | 直径约 18 m 广场，四周花境与乔木茂密，铺地暖米色，前沿弧形花境 | 同心圆、餐车、伞桌、售卖亭、长椅、杆灯都有，但大面积冷灰白铺地，只有两个花箱，四周几乎没有乔木 |
| G5 色温 | "暖米色与浅木色为主色调" | 室内地面与墙体偏冷灰白，木色只在隔断与家具上 |

另含 OF-R1 遗留 P3：广场低档测试只比较"completion 低档 < 高档"，`completion.js` 不把 `low` 传给 `appendOfficePlaza` 时测试仍通过（去参数变异存活）。

## 要做

1. **广场绿化（G4）**：
   - 沿广场外圈补乔木与花境：乔木 ≥ 8 棵、弧形花境 ≥ 4 段，分布参照参考图（前沿两侧弧形花境、左右侧乔木列）；
   - 优先复用已登记构件（共享 `office-plaza-props.js` 的 `trees` / `flowers` 类别、榕树叶簇做法），合入现有材质批次，不新增动画循环；
   - 所有新构件导出占地，与现有 18 个设施占地、4 m 入口中轴、广场通道互不重叠（沿用现有测试方式）；
   - 低档减少叶片与段数。
2. **暖色调（G5）**：
   - 广场铺地、室内地面、墙体与顶带改为暖米色 / 浅木色系（参考图主色），保持石材纹理可辨（曾经的 V-1 问题：纹理被冲淡、色温偏冷）；
   - 只改样板的材质颜色与贴图混合，不改全局曝光、灯光与色调映射；样板关闭时画面不变。
3. **OF-R1 遗留 P3**：断言 completion 低档中广场部分的三角形数等于 `appendOfficePlaza({ low: true })` 的结果（或等效做法），使"`completion.js` 不传 `low`"的变异被杀死；报告附变异输出。
4. **伞盖私有翻转**：仍按 OF-R1 处理——Trae 的共享伞盖修正（`integration/vis2-dr-rc1` 的 `c03540a`）未进入本分支前保留；若已进入基线，则本卡一并删除并加测试。

## 量化验收（便于独立复核）

固定机位：`?layout=3&officeSample=1&q=high&wall=1`，大屏 `window.__office.wallGo('overview')` 与 `wallGo('plaza')`，1920×1080，DPR 1。

| 项 | 要求 |
|---|---|
| 广场铺地采样（plaza 机位画面中部区域平均色） | R − B ≥ 15，且亮度在 0.70–0.88 之间（避免过暗或发白） |
| 室内地面采样（overview 机位吧台与前厅之间的地面区域） | R − B ≥ 10 |
| 乔木 / 花境数量 | 乔木 ≥ 8，花境 ≥ 4（构件计数，测试断言） |
| 性能（样板开、高档、overview） | 绘制调用增加 ≤ 3；三角形增加 ≤ 15%；低档三角形少于高档 |
| 样板关闭 | 画面与 `66bca48` 一致（同机位截图像素差为 0 或仅噪声） |

## 不做

不改 V3 布局、25 个工位、导航、`app.js`、共享家具与碰撞；不下载新素材；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人；报告 `dispatch/codex/outbox/OF-R2-report.md`：做到 / 没做到 / 未验证；量化验收表实测值；改前（`66bca48`）/ 改后同机位截图（overview、plaza、drlife、前厅）；变异输出。
- 截图不进源码历史；取证**不得读取真实运营数据**：静态服务本工作树，`/state` 用空状态夹具（`agents: []`、`world: null` 等），其余业务接口 404，外部请求拦截。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs`；全量仅在空闲内存充足时运行，失败按名称与 `66bca48` 比较，不得新增。
- 完成后停下，等待 Q-V1 复审。
