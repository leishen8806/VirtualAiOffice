# 办公室样板集成候选：卡 A / C / D

## 基线与边界

- 私有样板：`34af63ae3f0167c2849d73ff201d3d086c533e1f`。
- 隔离分支：`integration/office-evidence-20261023`，工作树 `E:\VirtualAIOffice\office-evidence-integration`。
- 本轮 B0：`483959e539cceef5e7cc54f01aad0b1c36345a6e`。在私有样板上带入已经验收的 O-06 三笔修改：原 `720c68a`、`ceda00d`、`14da015`；没有导入仓配修改。
- 当前源码对应本文件所在 Git 提交；执行证据绑定的完整 SHA 见外部 evidence-manifest.json。
- 不改 app.js、ui.js、index.html、server.mjs、导航、权限、业务写入与全局画质。原 25 工位、座位返回值、12 段岛台碰撞保留。

## 卡 A：接入方式

`office-v3-modules.js` 原 `island` 项调用 `buildOfficeSampleHost`。关闭时直接返回原 `buildOfficeIsland`，保持原合批与画面。启用条件为 **layout=3 且唯一的 officeSample=1**；缺失、重复或其他值关闭。

显式开启后，保留旧岛台作为回退。异步加载现有 `office-vis2/sample.js` 与已登记贴图；成功才隐藏旧画面。失败、关闭恢复旧岛台。旧岛台不参与跨模块合并，避免回退时丢失；原碰撞只登记一次。异步关闭/销毁使旧加载失效，新增资产仅由原样板控制器释放。无新增帧循环、定时器、业务请求。

入口合同：`/?layout=3&officeSample=1`。不是旧 `office-bar.js` 的 visualSample 分支；后者不改。

## 卡 C：有边界的适配

- 主场景复用原外壳，不叠加预览专用 24×30 m 底板、玻璃围合和入口立柱，避免覆盖其他区域或阻断旧路线。独立预览保持原样。
- 地面圆环从实际宿主地面包围盒测量顶面，再加 12 mm，避免被既有 80 mm 地面埋住；不移动全场地面。
- 既有接待字牌、背景 Logo、吧台品牌、榕树与植物形状保留。V-1 石材观感与 V-2 总览树形仍交董事会目视判断，不把接入成功当成审美通过。
- 接待家具、植物占地与宿主入口映射由 `island.mapping` 输出。没有把视觉家具登记成新业务热点，没有改变人物路线。

## 运行与证据边界

现有 3200 运行的是另一目录，不能绑定本候选 SHA；当前源码的静态扩展规则允许 js，子目录本身不是禁止项。`/office-vis2/sample.js` 的 404 与运行目录内容不一致有关。本轮没有修改白名单或重启服务。

验收浏览器通过 Playwright `route.fulfill({path})`，把当前工作树静态文件映射到既有 3200 页面；业务 GET 保持原入口，其余方法被验收层阻止。**这是可复现的隔离浏览器入口，不是服务已部署此分支，也不是普通浏览器直接打开就得到候选。** 复现脚本和静态文件清单在证据目录。

证据目录：`E:\VirtualAIOffice\review-artifacts\OFFICE-INTEGRATION-20261023`。截图与视频不加入源码历史。未删除旧审查证据。交给 Claude Code 复核后才能决定放行。

## 已测与限制

专项：39/39。全量：1198 项，1180 通过、17 失败、1 跳过；相对 1171/17/1 增加 O-06 六项与本次三项，失败名称集合未增加。所有运行带 2048 MB 堆上限、60 秒单测超时及指定测试路径。

主场景高档与低档均在相同相机、同一同步调用中切换新旧岛台；每次渲染先清零 renderer.info。高档 115→130 calls，99919→133739 三角形；低档 59→67 calls，50029→66961 三角形。样板旧记录不是硬预算；本轮不宣称这些增量已经批准。

短时三轮启停，关闭态和开启态 GPU 几何/纹理计数分别稳定；真实帧间隔中位约17.3–17.6ms、P95约18.2ms。仅代表该电脑与该短时观察，不能推断全员或长期性能。录像期间不用于性能统计。

重要限制：当前 rev3 `applyState` 在人物创建前提前返回，实测 0 真人。因此本轮未验证25人碰撞、任务交互与行走；O-06 路径回归测试通过不能替代该验证。全楼仍明显偏白，其他区玻璃与材料仍与概念图有差距；不在本批扩大修改。

## 卡 D：17 个既有失败逐项归属

| 测试 | 当前直接失败原因 | 范围与后续 |
|---|---|---|
| command-view-routes:13 | 缺 command-view.json | 业务配置测试缺可移植夹具；不能读取生产配置补齐 |
| display-staff:103 | 缺 display-staff.json | 展示人物配置测试缺夹具 |
| dr-campus-shell:48 | 缺 backup-nav-1d/app.js | 仓配共享接线旧备份断言 |
| dr-control-room:23 | 源码字符串断言 /demoSnapshotAt/ 不满足 | 仓配中控，源码/断言合同须由其负责人核实；不能只删断言 |
| office-furniture-v2:234 | 缺 backup-o4/resume/app.js | 办公家具接线历史快照缺失；行号因 O-06 变动，仍是同一失败 |
| office-layout-v2 整文件 | 缺 office3d-backup-o2/office-layout.js | 办公布局历史快照缺失，文件未能载入 |
| office-v2-integration:113 | 缺 backup-o6o7/resume/app.js | 办公集成历史快照缺失 |
| office-v2-registry:105 | 缺 backup-nav-1d/app.js | 办公接线历史快照缺失 |
| state-last-good 整文件 | 缺 backup-h2/server.mjs | 主线回退集成历史快照缺失，文件未能载入 |
| tenancy-server:51 | 缺 backup-m5-1/server.mjs | 权限接线历史快照缺失 |
| town-map-api:180 | 缺 backup-m1b/server.mjs | 小镇 API 历史快照缺失 |
| town-map 整文件 | 缺 town-map-data/m0/derived/town-map-v0.json | 小镇地图数据夹具缺失，文件未能载入 |
| town-nav:111 | 缺 town-nav.json | 导航配置测试缺夹具 |
| town-nav:158 | 缺 town-nav.json | 导航配置测试缺夹具 |
| warehouse-env 整文件 | 缺 backup-s2-1/env.js | 仓配环境旧快照缺失，文件未能载入 |
| warehouse-layout:94 | 缺 backup-s2-1/office-layout.js | 仓配数据旧快照缺失 |
| warehouse-shell:53 | 缺 backup-nav-1d/app.js | 仓配接线旧快照缺失 |

结论仅为失败来源归类，不能据此称全量全绿或主线安全已验证。后续应从经核验的历史提交提取非敏感夹具，保留原断言；本卡不伪造旧备份、不复制真实配置、不越权修仓配。
