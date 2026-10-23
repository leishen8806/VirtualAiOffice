# R3-R2 运行基线（2026-10-23，样板修改前）

本记录是会话二制作独立资产前的只读取样；并不宣称样板区或整场预算通过。此前已存在的球簇树包含在本次基线内。

| 核查项 | 当前证据与结论 |
|---|---|
| 工作目录 | `E:\VirtualAIOffice\paperclip-ops\office3d`；不是 Git 仓库，无法给出分支/提交；以文件 SHA-256 绑定版本。3200 PID 25896 的入口为该目录 server.mjs；四个下列文件 GET 内容与磁盘逐字一致 |
| 页面 | `http://office.localhost:3200/?place=drlife-office&layout=3`；真实浏览器已加载 |
| 开关/画质 | URL 仅 place/layout；运行时 quality.tier = high |
| 实际 V3 模块 | shell3、furniture3、island、zones、displayDepartments、displayStaff；skipped=[]；静态合并 removed=485 / added=5 |
| 渲染设置 | ACESFilmicToneMapping(4)，实际 exposure=1.2，outputColorSpace=srgb；阴影开启，type=1。源码初值 0.85 不等于最终运行值 |
| 灯光 | 半球光约 0.463；主方向光约 1.865（阴影开）；补光 0.35；数值受当前时段影响，未改变全局灯光 |
| 资产请求 | logo、家具 GLB、人物 GLTF/BIN/贴图、UAL1 动画返回 200；完整路径/状态/字节数见上级备份 runtime-before.json。当前未请求 office-v2 材质贴图库 |
| 实际材质 | V3 观察到的 map 为生成画布，colorSpace=srgb；中央树为程序化球簇。资源下载成功不代表所有原模型材质保留，当前合并会统一材质 |
| 色彩结论 | 目前没有证据证明重复 sRGB 转换；未凭猜测更改曝光。人物法线/粗糙度下载不能证明其最终绑定，不能据此判全场材质通过 |
| 主页面统计 | 一次取样 113 calls / 125643 triangles，含主场景/人物且非根可见性配对；不可作为 +12 calls 预算证明 |
| 证据目录 | `E:\VirtualAIOffice\paperclip-ops\office3d-backup-r3-r2`，主页面 1280×720 / 1920×1080 改前截图及运行资源记录 |
| 本轮范围 | 会话二：独立静态爱心榕树资产与预览；会话一：样板区集成、主场景配对预算及交互验收；样板通过前不扩展其他区域 |

关键文件 SHA-256（修改前）：

- office-island.js：`C9F8E5BB8BF91C8BCA6C5925224EB1E8736B52E71A9561FFC5D0A210161271F8`
- office-layout.js：`34BEFD2767BDF1A4DA918B1085355F09CE58BC1FEF7E4C39FC35599A54251F4E`
- office-v3-modules.js：`C26A11A77D54EB066C9C027598A68A4B1BB49B68DAC862088DFA9C5FF003917F`
- app.js：`499D963ECE35A0D17670E916F1E714F1B867FECF817A1FFBA4CC0848034C4A5F`
