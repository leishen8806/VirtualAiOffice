# AS1-2-car-kit-download：AS1 第二段（只限 W-B Kenney Car Kit 一个包）

**执行者：Codex（会话二，仓配产线）。** **董事会 2026-10-22 逐项确认：只批准 W-B；O-A 复用不下载；O-B、W-F（PSX Factory Kit）、W-A / W-C / W-D / W-E / W-G 一律不批准、不下载。** 本卡是 `AS1-3d-asset-intake.md` 第二段的**收窄版**，两者冲突时以本卡为准。**前置：S2-10 已验收。**

先读：`_common.md`（本卡对「禁止下载」做一次性例外，仅限下面这一个文件）、`AS1-3d-asset-intake.md` 第二段与验收、`docs\asset-candidates.md` 的 W-B 行、`assets3d.js`、`vendor\three\jsm\loaders\`。

## 获批的唯一下载
| 项 | 内容 |
|---|---|
| 名称 | Kenney Car Kit（作者 Kenney） |
| 来源 | https://kenney-assets.itch.io/car-kit（官方原始页；**不要用任何镜像、网盘、转载站**） |
| 文件 | `kenney_car-kit.zip`，页面显示 3.4 MB |
| 许可证 | Creative Commons CC0 1.0 Universal（商用、无需署名；仍须留档包内许可文本） |
| 用途 | 仅仓配产线（`?campus=1`）；只挑**白色厢式货车 / 面包车**及必要的普通货车，其余模型不拷进 `office3d` |

## 要做的事
1. 在**新的空目录** `E:\VirtualAIOffice\paperclip-ops\asset-intake\kenney-car-kit\` 下载并只解压，**不执行包内任何文件**；记录 zip 与每个解压文件的 SHA-256。若 itch 页面的下载需要人工点击或登录而你无法合规完成：**停下，写明卡在哪一步，由董事会手动下载后放到 `E:\VirtualAIOffice\paperclip-ops\asset-intake\kenney-car-kit\incoming\`，你再继续**；不得使用任何绕过手段或第三方链接。
2. 安全检查：压缩包内若含 `.exe / .bat / .ps1 / .js / .html / .py / .dll` 等可执行或脚本文件，**立即停下汇报**。
3. 许可留档：复制包内许可文本到 `office3d\assets\third-party\kenney-car-kit\LICENSE`；写 / 追加 `office3d\assets\third-party\MANIFEST.json`（包名、作者、来源网址、许可证、下载日期、文件清单与 SHA-256、实际使用的模型、产品线 = 仓配）。
4. 评估并筛选：列出包内全部车型及每个模型的三角形数、是否可分离车轮 / 车门、尺寸；挑出**最接近概念图的白色厢式货车**（概念图：白色厢式货车、蓝色驾驶室点缀）。**若没有合适的厢式车，如实报告并拒收，保留现有程序化卡车，不得为了用上而勉强接入。** 通过的模型转为 `.glb`（需要时用本机已有工具离线转换；不安装新工具），单个 ≤6k 三角形，纹理 ≤1024²，放 `office3d\assets\models\dr-campus\`（**不得放进办公区目录**）。
5. 预览：新增 `asset-preview.html`（仅仓配一个标签；显示模型、三角形、体积、许可证、签署「CC0」；**只请求本地静态资源**，深浅主题都可读，控制台 0 错误）。**本卡不接入主场景**；接入由后续 S2-6b 卡完成。
6. 测试：`MANIFEST.json` 中每个被使用的模型都有许可记录；`assets\models\` 下没有未登记文件；无可执行 / 脚本文件进入 `office3d`；全量 `node --test` 全过，不放宽任何断言。
7. 默认页面与办公区逐数据不变（路由快照零新增请求、零新增对象）。

## 约束与汇报
- 备份改动的既有文件到上一级目录 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-as1-2`。不要读取或打印任何密钥，不要自己重启服务，不要改开关。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；贴包内车型清单、被选模型的三角形与 SHA-256、预览页截图；**停下等我验收**。
