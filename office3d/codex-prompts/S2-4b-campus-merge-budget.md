# S2-4b-campus-merge-budget：园区外壳高档绘制调用超预算，需合并静态网格（只改园区模块，约 1 小时）

**执行者：Codex（接在 S2-4 之后，同一会话即可；做完停下等验收）。小镇线 · 场景。** 先读：`_common.md`、`_lane-town.md`、你自己的 `dr-campus-shell.js`、`dr-campus-registry.js`、`dr-campus-modules.js`、`app.js` 里园区注册表的接线（约第 717 行）与 `mergeStatic / quality.js`（**只读**，了解静态合并如何被画质档接管，以及为什么园区根没有被合并）。开工先备份到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-s2-4b`（**上一级目录**）。**允许修改：** `dr-campus-shell.js`、`dr-campus-registry.js`、`dr-campus-modules.js`、对应测试、`app.js`（**仅限园区那 2–3 行接线，若确有必要，逐行列出，≤ 5 行**）、README 一节。**不要改** `quality.js / merge.js / office-layout.js / env.js / server.mjs`。

## 董事会侧复核 S2-4（Playwright，1280×720，同机位切换 `campus-root.visible` 取精确增量）
**做对的：** 默认页面前后 **calls / 三角形 / 对象数完全一致**（高 1940 / 890,516 / 5062；低 385 / 311,720 / 5051）；`?campus=1` 只多出园区对象；注册表 `try/catch` 隔离、单模块出错被跳过且有测试；`app.js` 接线约 8 行；无光源、无 `dynamic`、控制台 0 错误；园区近景门牌、分区色块可见；近景连续帧像素差很小（无 z-fighting 迹象）；低档增量 **+1 call、+1,116 三角形**（达标）。

**不达标的：** **高档园区增量 +44～+48 calls（预算 ≤ +4，硬上限 ≤ +15）、+5.2k 三角形**；园区根有 **29 个 Mesh**，没有被合并 / 实例化（低档只有 4 个 Mesh，所以低档达标）。原因应当是：园区在 `mergeStatic` / 画质档快照**之后**才创建，没有被画质档的变体合并接管；且大面积薄件可能在阴影 pass 里被重复计入。后面还要加货架、月台、屏幕（S2-5 / S2-8），**不解决，预算会成倍超出**。

## 要做的事
1. **通用方案（优先）**：让 `createCampusRegistry` 在 `buildAll()` 末尾对**所有模块创建的静态网格**（不含 `userData.dynamic`）**按材质合并成批次**（`BufferGeometryUtils.mergeGeometries` 或沿用 `merge.js` 的现有合并函数，**只读复用，不改它**），合并后原网格从场景移除并 `dispose`；动态件保持独立。这样后续 S2-5 / S2-8 通过注册口加入的模块**自动受益**。合并必须保持：命名（`campus-<part>` 作为批次名，保留可拾取区 / 门牌等需要独立交互的小件为独立网格并在清单里列出）、材质共享、`polygonOffset` 与渲染顺序（**无 z-fighting 回归**）、包围盒与可见性（`campus-root.visible` 仍可整体开关）。
2. **阴影**：大面积薄件（地面铺装、分区色块、水景面）**关闭 `castShadow / receiveShadow`**（除非屋顶 / 墙体确需），减少阴影 pass 重复计数；写明每类部件的设置与理由。
3. **预算验收（硬）**：`?campus=1` 同机位 **切换 `campus-root.visible` 取增量**：**高档 ≤ +4 calls（目标；硬上限 ≤ +8）、低档 ≤ +1 call；三角形增量不超过现状的 +20%**；不新增光源。给出合并前后的 Mesh 数与 calls 对照表（高 / 低各一）。
4. **视觉回归**：合并前后园区俯视、前广场近景、物流门近景各一张截图逐像素对比（允许抗锯齿级差异），**连续 6 帧像素差证明无闪烁**；顺手检查 **俯视机位下屋顶是否把内部分区完全遮住**，若是，给出 1 句话的处理建议（例如屋顶半透明 / 北侧开顶），**本卡不必实现，只报告**。
5. **回归**：默认页面零变化（calls / 三角形 / 对象数与 S2-4 一致）；`node --test tests/*.test.mjs` 全过；T16b 200 种子仍全过；`tests\home-items-3d.test.mjs` 里 **「A7保持独立…没有改动app.js」把 `app.js` 与 A7 备份逐字比较的断言已过时**（任何后续改动 `app.js` 都会使它失败）：把「app.js 与备份相等」改成「`home-items-3d.js` 不 import / 引用 `app.js`」，其余断言不变，并在汇报里写明这是与本系列 `app.js` 改动直接相关的断言调整。
6. 汇报「做到 / 没做到 / 未验证」，与磁盘一致；贴 Mesh 数、calls 增量对照、`app.js` 改动行。**不要自己重启服务。**
