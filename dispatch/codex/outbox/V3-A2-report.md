# V3-A2 交付回执

状态：实现及限定范围验证已完成，提交 Q-V1 复审；不自行判定验收通过。展示模块待接、沙发外沿问题仍明确保留。

## 基线与授权

- origin 核验为派单指定仓库；独立分支 `feat/v3-align-scene` 起点 `f0f4632b0a4f77350fd87a66df5e10ef62f63d5b`，开工工作区干净。
- 仅合入指定通过版本 `3c0ffff989a2a60ef610139cd4b50ed22dfe70c2`；合并提交 `60bd0ad2b4d18d6d670f67545bbf7f3852c5bf04`。没有合入未审提交，没有改动两个来源分支。
- 已读派单 README、00-PRIORITY 与 V3-A2，派单版本 `029d5f26944d422e99589c792dc30e51868de238`。
- 本轮追加裁决：坐垫边缘到台面边缘门槛从 .45m 改为 **.30m**；只改校验和对应边界测试，不改任何座位或坐垫尺寸，不替代通道净宽。
- 合并后待改文件已备份到本轮独立备份目录；基线源码另从 Git f0f4632 文件对象导出到外置证据，不覆盖候选。
- 最终候选为本报告所在提交；完整 SHA 在推送回执与外置 evidence-manifest.json 绑定。

## 做到

| 卡项 | 实际结果 |
|---|---|
| 0 接线 | app 第963行两处 LAYOUT_V3→OFFICE_LAYOUT，净增0行；注册表使用实际布局，缺布局回退稳定V3。 |
| 1 外壳 | 只给 walled=true 七间生成墙段/门框，每间唯一1.5m门洞按数据定位；八个开放区无墙段、门框或旧墙饰。外围、入口和前厅保持。 |
| 2 地面 | open/display/room 分别统一暖色；6..10m浅色环带加深色内外边；矩形 corridors/passages 裁到建筑内并做并集去重，重叠路径不会叠加共面。 |
| 3 岛台 | 样板关/开均采用同一12段、外沿6m的碰撞；台身3.5m，台面3.545m，吧凳环最小4.2m、坐垫半径.28m；.375m实际净距满足新 .30m 门槛。东西开口≥1.5m。 |
| 4 陈设 | 五个开放区接入成组规划器，三个功能区用同一避让器摆休闲桌椅；实际31件，按真实顶点测占地并注册现有collision.add。避让全部25工位≥1.6m、走廊/通道、七间门外1.5×1.5m和r<10区域。不能放下的组记录skipped。 |
| 5 展示 | 选择卡片允许的pendingModule：ALIGN的displayDepartments/displayStaff明确待接，稳定V3不变。没有继续套用旧门向、没有抛错。 |

障碍物接口：`scene.userData.officeV3.get('zones').obstacles()`，返回31项含ID与xyz边界的副本；`get('zones').furnishings` 可查各区placements/groups/skipped。高低档物件数相同、细节量不同，销毁移除自己注册的代理。

| 区域 | 物件数 | 跳过情况 |
|---|---:|---|
| west-open | 10 | 2桌岛+2绿植；另外2绿植跳过 |
| kb | 4 | 桌岛都跳过，保留4绿植 |
| product | 1 | 桌岛与其余绿植跳过 |
| eng | 0 | 固定工位净距下当前模板均放不下 |
| drlife | 0 | 固定工位净距下当前模板均放不下 |
| creative | 5 | 1圆桌4椅；绿植跳过 |
| dining | 7 | 1圆桌4椅2绿植；另2绿植跳过 |
| leisure | 4 | 2沙发1桌1绿植；另3绿植跳过 |

## 没做到 / 后续接入

- `validateIslandRings(ALIGN)` 原样输出：`{ok:false,errors:['SOFA_BEYOND_COLLISION'],sofaOuterEdge:6.14658759291183}`。外沿超6m约.147m。依卡不改冻结布局，交第3步决定沙发尺寸。
- 四角展示部门与展示人物目前待接，四间展示室尚空；需第3步按新east/west/north门向接入。
- 工程、工坊没有成功新增陈设，知识/产品区也未摆下桌岛。没有通过缩小人物避让半径、占走廊或移动真实工位制造通过。
- 与概念图仍有家具密度、绿植细节、材质光照与空间比例差异；本卡不宣称1:1视觉验收，也不扩大到全局灯光、布局数据和真人路线改造。

## 稳定V3不变性证据

1. 保留A2P/R1已有原始基线与断言；新增f0f4632完整注册表快照哈希（高/低、样板关/开），包含全部已构建网格属性数组、索引、实例矩阵/色、世界矩阵、材质参数、阴影/可见标志及注册碰撞边界；只统一随机UUID。Node夹具不加载工位GLTF，未冒充实物模型测试。
2. 浏览器加载真实GLTF工位，注册根全部网格另行逐项哈希；四组与f0f4632完全相同（高关132、高开189、低关131、低开186个Mesh）。哈希及逐Mesh明细在外置 browser-final.json。
3. 25个工位ID和坐标直接来自未改动的office-layout.js，浏览器记录完整25项；源布局、路线、业务映射和office-furniture-v2.js均无差异。
4. 1920×1080全图像素对照低于同版本重拍噪声。初次取证记录如下（提交后复核见表后）：

| 高/低 × 样板 | 跨版平均绝对RGB差（0–255） | 基线重拍噪声 | 候选重拍噪声 |
|---|---:|---:|---:|
| 高 关 | .00000788 | .00011188 | .00011735 |
| 高 开 | .00011317 | .00057935 | .00054848 |
| 低 关 | .00000016 | .00000354 | .00000370 |
| 低 开 | .00000193 | .00001768 | .00001833 |

运行代码提交 `a3576ed56e45b21b20ce762889a17865f2d72d5c` 后，又从干净工作区复核高档两种状态：网格哈希和calls/三角形仍与基线一致。当前高档截图为这次重拍，跨版平均RGB差分别 **.00000177（关）/.00005498（开）**，候选自身重拍噪声 **.00009774/.00046071**；基线噪声同上。低档未重拍。最新原始指标见 pixel-comparison.json，提交后浏览器记录见 postcommit-browser.json；本次仅追加回执数据，未再改运行代码。

没有隐藏被测办公场景物体。仅所有版本同样启用clean界面、清空夹具人物、隐藏董事会角色、固定昼间环境和相机；原图、重拍图与比较脚本均保留，不把非零差异说成像素零差异。

## 浏览器与性能

Windows、Headless Chrome 156；系统显卡清单包含NVIDIA GeForce RTX 5070 Ti（未单独确认浏览器适配器绑定）；1920×1080、DPR固定1，既有高/低画质。截图通过真实主入口的静态路由加载当前文件，不是另一套预览场景或生产服务证据。

固定总览：az10°、el52°、r80、target[2,0,0]。样板开/关各有总览、吧台、西开放区、产品/工程区、四角房间分别近景与参考构图截图；目标图来自仓库 main 的 target-office.png，并排图标明概念图与真实浏览器。

主场景本身隔帧刷新阴影，故分开报告缓存/刷新两种同口径帧；没有把两种帧混作前后差异。取证脚本固定DPR，保留高档RenderPass+GTAO。

| 场景 | 阴影缓存 calls / 三角形 | 阴影刷新 calls / 三角形 | renderer geometry / texture |
|---|---:|---:|---:|
| f0f4632 高档样板关 | 121 / 111,023 | 131 / 124,543 | 70 / 25 |
| 候选稳定V3 高档样板关 | 121 / 111,023 | 131 / 124,543 | 70 / 25 |
| f0f4632 高档样板开 | 140 / 264,395 | 151 / 284,515 | 91 / 47 |
| 候选稳定V3 高档样板开 | 140 / 264,395 | 151 / 284,515 | 91 / 47 |
| ALIGN 高档样板开 | 126 / 266,159 | 137 / 286,279 | 84 / 43 |
| ALIGN 高档样板关 | 107 / 128,699 | 117 / 142,219 | 63 / 21 |
| ALIGN 低档样板开 | 63 / 95,179 | 不启用阴影，同左 | 85 / 27 |

高档样板开总览相对稳定V3：calls **−14**，刷新帧三角形 **+1,764（+0.62%）**；满足≤+6 calls、≤+20%。低档三角形少于高档。低档geometry计数比高档多1来自既有画质变体，不是三角形更高。

页面既有指标记录高档约60FPS/16.67ms、低档30FPS/33.33ms；另外90次浏览器rAF采样约16.7ms不是低档实际绘制FPS，不能混用。短时取证不代表全生产负载性能保证。

所有页面异常0；无非GET与外部请求。/state只返回空夹具，/foyer与/wall/data请求被本地404响应，均未到生产服务。没有读真实运营数据、启停任何服务或触发写入。

## 测试

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-scene.test.mjs tests/office-v3-align-sample.test.mjs tests/office-vis2.test.mjs tests/office-v3-meeting-navigation.test.mjs
tests 57
pass 57
fail 0
cancelled 0
skipped 0
duration_ms 2663.2503

node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs
tests 194
pass 190
fail 4
duration_ms 24946.7313
```

f0f4632基线170/166通过/4失败；候选194/190/4。按测试名比对无新增失败；以下均缺本地历史备份，没有删除、跳过或放宽断言：

- O4 app wiring stays within its own 20-line budget and layout1 data is identical
- O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines
- O6O7 production wiring contains no business, network, warehouse or wall-clock reads
- tests/office-layout-v2.test.mjs

FIX3会议/真实director到离场/队列/1375条路线专项11项全过；它是稳定V3回归，不证明ALIGN真人路线完成。修改的浏览器JS均执行 `node --input-type=module --check < 文件.js`，`git diff --check`通过。

## 未验证

- 全仓 `tests/*.test.mjs` 未运行：浏览器期间空闲内存约1.49GiB，关闭后约2.91GiB；本卡允许内存充足再跑，全仓含嵌套测试进程，本轮没有为凑全量冒险启动。只报告上面的实际范围。
- 未验证生产主页面实时业务、ALIGN真人行走/避让及长期资源趋势；不修改导航，第3步仍需消费障碍物清单并复验。
- 没有部署、重启服务、合入main，也不自行通过视觉验收。

原始图片/脚本/日志/测量：外置 `review-artifacts/V3-A2-initial/`，入口 `evidence.html`，不把图片加入Git；外置manifest绑定最终远端SHA、相机、环境与文件hash。

## 本轮修改清单（相对合并提交60bd0ad，不重复计算已验收样板）

| 文件 | 新增 / 删除行 |
|---|---:|
| office3d/app.js | 1 / 1（第963行，仅两处变量替换） |
| office3d/office-bar-geometry.js | 2 / 2 |
| office3d/office-layout-v3-scene.js | 1 / 1 |
| office3d/office-v3-modules.js | 4 / 2 |
| office3d/office-vis2/MANIFEST.json | 11 / 4 |
| office3d/office-vis2/align-zones.js | 新增67 |
| office3d/office-vis2/open-furnishing.js | 21 / 5 |
| office3d/office-vis2/shell-finish.js | 3 / 1 |
| office3d/office-vis2/whole-floor.js | 1 / 0 |
| office3d/office-vis2/zone-finish.js | 2 / 0 |
| office3d/tests/office-v3-align-sample.test.mjs | 5 / 5，仅对应.30m新裁决 |
| office3d/tests/office-v3-align-scene.test.mjs | 新增116 |
| office3d/docs/v3-align-scene.md | 新增49 |
| 本回执 | 新增 |

原始参考图、任何历史证据与备份均未删除；没有修改卡片范围外文件。源码发现的旧4条历史备份依赖仍留给维护者处理。

## 2026-10-24 补充卡执行记录（在 f07acba 上追加）

派单基准：dispatch/codex @ 35bf19e28e47ccf3d3cc1355c9c90704f967f443。现有分支已含 f0f4632b0a4f77350fd87a66df5e10ef62f63d5b 与通过样板 3c0ffff989a2a60ef610139cd4b50ed22dfe70c2，本轮不重复合并、不回退。

- 仅 ALIGN 将每半圈碰撞近似从6段细分为32段，总计64个AABB；稳定V3仍12段，原完整基线哈希断言保留并通过。本段覆盖初次回执中的 ALIGN 12段现状。
- 实际浏览器世界坐标顶点探针：碰撞最远角 **7.010861562 → 6.221722397 m**（要求≤6.3m）。新增断言覆盖所有角点、两扇区的512等分采样、内外半径与东西1.5m开口；旧12段作为失败对照。
- 吧凳门槛仍为坐垫边缘到台面边缘≥0.30m；实测0.375m通过，0.300通过、0.299及明确0.25m合成反例失败。未移动坐垫或台面。
- 未合入尚未通知通过的 V3-A1-R2。沙发中心仍5.8m，检查实际输出 `{ok:false,errors:['SOFA_BEYOND_COLLISION'],sofaOuterEdge:6.14658759291183}`；待派发人给出通过SHA后另行合并。

同机位1920×1080、DPR1、高档、固定昼间、无业务人物的真实浏览器测量：

| 样板 | 时点 | 碰撞代理 | 最远角m | calls 阴影缓存/刷新 | 三角形 阴影缓存/刷新 |
|---|---|---:|---:|---:|---:|
| 开 | 修改前 f07acba | 12 | 7.010862 | 126 / 137 | 266159 / 286279 |
| 开 | 本轮修改后 | 64 | 6.221722 | 126 / 137 | 266159 / 286279 |
| 关 | 本轮修改后 | 64 | 6.221722 | 107 / 117 | 128699 / 142219 |

碰撞代理不可见，因此绘制未增加；样板开时总碰撞对象195→247。更多AABB的CPU枚举成本及真人行走尚未测量，不以calls相同推断性能完全不变。

专项 **58/58通过**；办公室全集 **195项，191通过、4失败、0取消、0跳过**（24.90秒）。与上轮194项/190通过相同的四项历史备份缺失失败，无新增失败；不删断言、不伪造备份。测试均带1024MB堆上限、单并发、60000ms超时。浏览器模块语法与diff空白检查通过。全仓测试未运行，沿用本机可用内存不足的边界。

新证据独立保存在 `E:/VirtualAIOffice/review-artifacts/V3-A2-addendum/`，入口 `evidence.html`，manifest绑定最终提交及截图/日志哈希；旧证据完整保留。浏览器为本地静态路由+空/state夹具，未访问生产业务；无未捕获pageerror，夹具中的/foyer、/wall/data等本地404不代表服务故障。已保存修改前后总览和吧台近景。

本轮只改 office-bar-geometry.js、两个ALIGN测试及本规划/回执五个文件；未改 app.js、布局数据、人员映射、导航或服务。新增内容待独立复审，本轮不声称视觉1:1或真人可达性通过。
