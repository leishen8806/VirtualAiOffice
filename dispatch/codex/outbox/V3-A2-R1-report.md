# V3-A2-R1 回执

## 做到

- 派单版本：024a5183b4ecf98250a28de7696cc45afa9a3b56。开工工作树干净，分支 feat/v3-align-scene，基线 befaa45020dc83a35ae4b82413ceed3846e90be4。
- 只合入通过版 fb1e8998815dfb9b3a592266544fe4003aa4beb1；合并提交0ae321de8497d60bde491371564e5cf28a5274d2，无冲突。未合入远端最新但未审版本，未自行修改布局数据。
- 沙发检查真实输出：`{"ok":true,"errors":[],"sofaOuterEdge":5.801364589431185}`。
- 运维屏由布局中的 west-open、westNorthCross 与 deskGroups.ops 推导，中心(-23.25,-2.7)，朝向+z的桌组，距最近Ops工位中心约2.440m（≤6m）。离开售后室。
- 书架由 kb 北边界与区域中心推导，中心(15.3,-17.45)、(18.1,-17.45)，都朝+z；没有改变25个工位身份或坐标。
- `scene.userData.officeV3.get('furniture3').obstacles()` 提供三项实际顶点边界，格式与 zones 接口一致。书架实体及屏幕两支柱维持原实际几何碰撞，不增重复碰撞体；新增清单由第3步导航消费。
- 稳定V3的旧坐标原样保留；浏览器189网格指纹前后一致。app、导航、展示部门/人物、服务代码未改。

## 实际浏览器取证

使用现有入口的本地静态文件路由、空/state夹具；外部及非GET请求拦截。没有服务启动、重启或真实业务访问。其他动态入口返回本地404是夹具限制，不将其报告为真实服务正常。ALIGN前后均无未捕获pageerror。

环境：Windows，HeadlessChrome 156.0.0.0，1920×1080，DPR1，URL固定high、固定昼间，样板开启，空业务人物；原RenderPass/GTAO保留。截图均实际浏览器输出。

| 物件 | 世界范围 x | 世界范围 z | 最近工位净距m | 越界/有墙房间/矩形通道相交 |
|---|---|---|---:|---|
| 运维屏（含支柱） | -25.267500..-21.232500 | -2.740000..-2.530000 | 1.530000 | 全无 |
| 书架0 | 13.900000..16.700001 | -17.750000..-17.150000 | 2.150000 | 全无 |
| 书架1 | 17.100000..19.100000 | -17.750000..-17.150000 | 3.373796 | 全无 |

屏幕实际三角面法线朝+z、桌组在其正面，几何断言通过；真实近景可读“运维 · 状态见任务面板”。书架完整处于知识区，实际模型最远东界19.100000m，场地东界32m。

固定相机（az/el为度、目标[x,y,z]）：
- ops：65 / 25，r13，target[-25,1,-0.5]。
- shelves：0 / 40，r15，target[17,1,-15]。
- overview：10 / 52，r80，target[2,0,0]。

外置证据目录：`review-artifacts/V3-A2-R1/`，入口 `evidence.html`。
- before/after-ops.png、before/after-shelves.png、before/after-overview.png。
- browser-results.json：真实几何范围、运行模块、请求和前后render记录。
- stable-proof.json / stable-proof.js：旧/新家具代码在稳定V3主场景真实资产下比较；189网格几何/世界矩阵/材质（去随机UUID）哈希均为 `fa8f3226589150c7aba4c8ab1f111fe55ebd1f23186abf3c5a99fee5acd6a070`。
- evidence-manifest.json：交付SHA、来源文件hash和证据hash。截图不入Git。

同机位总览（同一阴影刷新策略）：

| 指标 | befaa45 | 修改后 |
|---|---:|---:|
| calls，阴影缓存 |126|126|
| calls，阴影刷新 |137|137|
| 三角形，阴影缓存 |266159|266159|
| 三角形，阴影刷新 |286279|286279|
| 总碰撞对象 |247|247|

这是静态空夹具的测量，不外推为多人运行性能或生产结果。

## 测试

在 office3d 目录执行；测试之前已跑 befaa45 的办公室全集作为当次基线。

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-scene.test.mjs

ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 799.069
TEST_EXIT=0
```

新增断言检查实际顶点、25工位净距、区域/通道/陈设互斥、Ops≤6m、屏幕朝向、障碍清单和碰撞清理、布局数据变动驱动位置、稳定旧坐标。合入已通过沙发后把原“超界”断言改为ok=true；不改其他阈值。

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs

# 修改后真实统计
ℹ tests 197
ℹ suites 0
ℹ pass 193
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 26097.4869
TEST_EXIT=1
```

基线195项/191通过/4失败，27039.7678ms；修改后新增两项通过。失败名称完全一致，新失败0（failure-comparison.json）：
- O4 app wiring stays within its own 20-line budget and layout1 data is identical
- tests/office-layout-v2.test.mjs
- O6O7 production wiring contains no business, network, warehouse or wall-clock reads
- O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines

以上均缺历史备份报ENOENT；未造备份、跳过测试或放宽断言。另执行 `node --input-type=module --check < office-furniture-v2.js` 和 `git diff --check`，均通过。

## 文件范围

指定沙发合并带入原提交7个文件（布局、配套规划/检查/测试、Trae回执），不自行改它们。本次自己修改仅：
- office3d/office-furniture-v2.js：+24/-6，ALIGN位置、真实障碍清单及对应清理。
- office3d/tests/office-v3-align-scene.test.mjs：+47/-1，新增两项测试及沙发通过断言。
- office3d/docs/v3-align-scene.md：追加本轮状态与接口。
- 本回执：新增。

备份：office3d-backup-v3-a2-r1；旧证据保留，不改写已审提交。

## 没做到 / 未验证

四项历史备份缺失仍存在，不属于本卡修复范围；本卡要求的修正与合并均已做。未验证实际人物行走、生产业务及全仓测试。导航接线留给第3步Trae，开放工位成组与密度留给第4步；不以本卡截图宣称完整概念图还原。

推送后停下等待Q-V1复审，不开始其他卡，不部署或合入main。
