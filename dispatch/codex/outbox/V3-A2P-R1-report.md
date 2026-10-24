# V3-A2P-R1 返修回执

状态：**部分完成，C 项仍不通过；停止等待尺寸裁决及 Q-V1 复审。** 不申请自动合并。

## 基线与裁决

- 分支：`feat/v3-align-sample`，从 `6f95f9e38226c1dfeb0c1552f07d65f076cef1f8` 追加；开工工作区干净。
- 已读取派单分支 `bf7e2a54860bf4606bdf37562fe506a4c906019d` 的 README 和本卡；没有合并派单分支。
- 候选版本：本报告所在提交。完整远端 SHA 在交付回执和外置 `evidence-manifest.json` 中绑定。
- D 裁决：**组间及通道 ≥1.2m；组内不重叠并保留必要使用空间。** 原逐件 1.2m 断言仅依此改为不同组及组外框约束，其他净距、顶点、预算断言保留。
- C 裁决：**按实际边缘净距 ≥0.45m；先列出尺寸冲突，不擅改座位或坐垫。** 已按这个口径校验，不把中心距离当作通过。

## 做到

| 项 | 结果 |
|---|---|
| A 共享座位 | 仅台身/碰撞半径不同时优先显式座位；保留 ID/yaw，补 angle；无显式座位才按 stoolRadius 生成，高 10 / 低 6。夹具实际半径 4.2000–4.2202m，展示吧凳避让盒最远角 4.6261m < 6m。没有修改展示人物实现。 |
| B 开关碰撞 | 原岛台代理和返回值均直接读 `barColliders(layout)`；夹具开关均为同一 12 段、外沿 6m。台体和台面不跟随碰撞半径放大。 |
| C 共享沙发与检查 | 样板和共享 `barLounges` 对齐；接近点为中心半径减 .55m。新增只读 `validateIslandRings`，覆盖靠背外沿、坐垫与台面净距、两圈相交及门口宽度。两种沙发样例可切换，失败原因持续显示。 |
| D 陈设成组 | 共享长桌岛含 1 桌、1 矮隔断、两端矮柜，前侧留 .6m 使用空间，另有转角绿植模板。整体避让工位和通道；`groups` 包含 ID、模板、成员和外框。相同 west-open 夹具实际放下 1 桌岛 + 2 绿植组，6 件陈设；另 1 桌岛、2 绿植组整组跳过并列明，未挤占通道。 |
| E 叶色 | 提取既有植物的正反独立顶点叶片算法供两者共用；原植物数组/材质不变。新叶片不再出现正反共享顶点的法线抵消，不调光、不改颜色、不新增批次。 |

D 组外框之间最小轴向净距为 3.95m；保留原 1.4m 通道、6 个工位占位与工位半径 + .6m 避让。没有新建真实工位或注册碰撞。

### C 未通过的尺寸冲突

当前实际 10 个座位中最小中心半径 **4.200m**，坐垫半径 **.280m**，台面外沿 **3.545m**；最小边缘净距 **.375m**，少于要求 .45m，差 **.075m**。已用实例矩阵变换后的真实坐垫顶点核对。

| 沙发中心 | 实测靠背外沿 | 6m 碰撞内 | 坐垫到台面 | 校验结果 |
|---|---:|---|---:|---|
| 5.8m（保留方案值） | 6.146588m | 超出 .146588m | .375m | `SOFA_BEYOND_COLLISION` + `STOOL_COUNTER_CLEARANCE` |
| 5.45m（比较样例） | 5.801365m | 在内 | .375m | `STOOL_COUNTER_CLEARANCE`，**不是合规样例** |

纯函数校验通过的正例仅用合成边界输入（座位环 4.275m）证明 .45m 判定有效，**不写回夹具、不作为批准方案**。夹具全部座位和坐垫尺寸保留；沙发最终尺寸仍交后续路线阶段决定。

校正记录：最初询问按取整误差估算最小净距约 .342m；随后逐个读取座位并实测顶点，纠正为 .375m。旧估算不作为验收证据，失败结论未变。

## 不变性证明

1. 保留原 `docs/v3-a2p-baseline-geometry.json` 与对应断言，文件未改。
2. 新增 `docs/v3-a2p-r1-baseline.json`，来源是 Git `345cd39f7dddebf4e4e61e146af7a283cd415088` 原始文件对象，不是把当前结果写成期望。
3. 逐项比对已有 7 个纯函数的 JSON 字节（另含低档座位）；高/低档原岛台、样板、品牌、既有绿植的全部几何属性/索引/实例矩阵 SHA-256、世界矩阵、可见/阴影标志、材质序列化参数。仅随机 UUID 统一占位，不删除其他材质参数。
4. 无对齐夹具参数的旧 V3 独立预览：高/低档各总览、吧台视角共 4 对截图，1920×1080，全图像素差 **0**。仅取证时同时隐藏两版预览操作栏，不隐藏场景物体。
5. `office-layout.js`、Agent/工位映射、主入口、导航、导演、仓配、业务文件均没有改动。

## 实际浏览器与性能

证据目录：`review-artifacts/V3-A2P-R1/`，入口 `evidence.html`。原图、掩模、相机、脚本、测量 JSON 和日志留在外置工件，不把图片加入 Git。

环境：Windows，Headless Chrome 156，NVIDIA GeForce RTX 5070 Ti / ANGLE D3D11，1920×1080，DPR 1；使用现有预览高/低档设置与灯光。浏览器路由仅提供本地静态白名单文件；外部及非 GET 请求拦截，业务数据不读取。

| 同机位指标 | 6f95f9e 高 | 候选高 | 6f95f9e 低 | 候选低 |
|---|---:|---:|---:|---:|
| 开放陈设批次 | 1 | 1 | 1 | 1 |
| 开放陈设三角形 | 1,752 | 1,932 | 936 | 612 |
| 整个夹具视图 calls | 14 | 14 | 13 | 13 |
| 整个夹具视图三角形 | 31,616 | 31,796 | 19,952 | 19,628 |

同一候选镜头仅切换陈设 Mesh 可见性：高 13→14 calls、29,864→31,796 三角形；低 12→13 calls、19,016→19,628 三角形。均为 +1 call，陈设三角形低于 8,000。

120 个采样帧：高档帧间隔中位 16.7ms / P95 16.8ms；低档 33.3ms / P95 33.5ms。这里受既有档位限帧，不是生产主场景 FPS 承诺。
8 次退出/进入后稳定为 1 个陈设根；高档 15 geometry / 8 texture，低档 15 / 6，无持续增长。页面异常 0，业务请求 0；只代表这些静态预览观察。

### D 同机位对照

- 高档：`before-high-open.png` / `after-high-open.png`。
- 低档：`before-low-open.png` / `after-low-open.png`。
- 相机位置 `[-18.25,16,18]`，目标 `[-18.25,0,.5]`，FOV 42；两版同种子、同灯光、同尺寸。
- 沙发：`after-high-bar.png` 与 `after-high-sofa-good.png`；后者文件名沿用采集脚本的“比较样例”，画面明确显示 **STOOL_COUNTER_CLEARANCE**，不代表通过。

### E 叶片取色

同一半球光、方向光、相机相对位置 `[1.6,2.3,2.8]`、目标高度 .85m、FOV 42。把真实叶片三角形投影到截图，取并集掩模、内缩 1 像素，统计全部剩余像素，**没有颜色/亮度筛选**。

| 对象 | ROI（左、上、右、下） | 像素 | 平均 R/G/B | 平均亮度 |
|---|---|---:|---|---:|
| 原开放区叶片 | 807,389,1113,650 | 23,261 | 9.46 / 16.56 / 3.87 | 14.13 |
| 既有吧台绿植 | 787,327,1116,642 | 32,802 | 70.12 / 93.22 / 50.85 | 85.25 |
| 候选开放区叶片 | 834,374,1086,644 | 28,176 | 68.64 / 92.91 / 50.83 | 84.71 |

亮度口径为截图 sRGB 码值的 .2126R + .7152G + .0722B；候选 G>R 且 G>B，相对吧台亮度 **99.37% ≥70%**。吧台叶片改前改后数值完全相同。
原图、ROI框图、二值掩模、投影顶点与脚本均保留。

## 测试

命令均使用 1024 MiB 堆上限、60 秒测试超时、并发 1。

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-sample.test.mjs tests/office-vis2.test.mjs
ℹ tests 34
ℹ pass 34
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1308.1005

node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs
ℹ tests 173
ℹ pass 169
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 24109.0642
```

开工基线 167 项 / 163 通过 / 4 失败；候选 173 / 169 / 4，按名称无新增失败。4 项都因本地缺少历史备份文件：

- `O4 app wiring stays within its own 20-line budget and layout1 data is identical`
- `O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines`
- `O6O7 production wiring contains no business, network, warehouse or wall-clock reads`
- `tests\office-layout-v2.test.mjs`

本轮没有删除、跳过或放宽上述失败测试。所有修改的浏览器 JS 通过 `node --input-type=module --check < 文件.js`，`git diff --check` 通过。

## 修改文件

| 文件 | 新增/删除行 |
|---|---:|
| `office3d/office-bar-geometry.js` | +33 / −10 |
| `office3d/office-island.js` | +3 / −3 |
| `office3d/office-vis2-preview.html` | +1 / −1 |
| `office3d/office-vis2/MANIFEST.json` | +4 / −4 |
| `office3d/office-vis2/align-fixture.js` | +2 / −2 |
| `office3d/office-vis2/bar.js` | +4 / −7 |
| `office3d/office-vis2/brand.js` | +1 / −1 |
| `office3d/office-vis2/open-furnishing.js` | +35 / −15 |
| `office3d/office-vis2/plants.js` | +20 / −15 |
| `office3d/office-vis2/preview.js` | +6 / −3 |
| `office3d/tests/office-v3-align-sample.test.mjs` | +128 / −5 |

另新增：`office3d/docs/v3-a2p-r1-baseline.json`（扩展原始基线）、`office3d/docs/v3-a2p-r1-evidence.md`（复核说明）、本回执。

## 没做到 / 未验证

- **没做到：C 项没有一个获准布局的完全合规样例。** 5.45m 仅修正沙发外沿，坐垫与台面仍差 .075m。按用户裁决不动座位或坐垫，等待尺寸决策；不宣称全卡通过。
- **未验证：全仓 `tests/*.test.mjs`。** 浏览器工作时可用物理内存约 1.3–1.8 GiB，关闭浏览器后约 2.25 GiB；不足以安全容纳带 1 GiB 上限的父/子进程及系统余量，本卡允许在内存充足时才跑全量。
- **未验证：生产主场景、真实人物路线和真实运营数据。** 独立预览的零差异不能替代全主场景验收；没有接 `LAYOUT_V3_ALIGN`、没有启停服务或新增业务请求。
- 未开始下一张卡；不合并、不部署，提交后停止等待复审及 C 尺寸裁决。
