# O4b-office-v2-registry：办公区 v2「模块注册口」（让办公区各模块不再每次改 `app.js`，约 45 分钟）

**执行者：Codex（会话一，接在 O4 之后）。办公区产线。改 `app.js`（仅此一次）。** **背景：** 董事会批准 **Trae 加入区域建设**（办公区与仓配两条线都要尽快「焕然一新」）。`app.js` 是瓶颈，所以办公区也要像仓配园区那样有**模块注册口**，之后 Trae 的 O6（吧台）、O7（展示部门）等模块**经注册口接入，不再改 `app.js`**。**产品隔离：这是办公区自己的注册口 `office-v2-registry.js`，不得复用 `dr-campus-registry.js`，两者互不 import。**

先读：`_common.md`、`_lane-town.md`、`dr-campus-registry.js` 与 `dr-campus-modules.js`（**只读参考写法**）、你自己的 `office-layout-v2-scene.js` 与 O4 的家具模块、`app.js` 里 O3 / O4 的接线。开工前备份 `app.js` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-o4b`（上一级目录）。

## 要做的事
1. 新增 `office-v2-registry.js`：`createOfficeV2Registry({ THREE, scene, quality, layout })` → `{ root, register(name, factory), buildAll(shared), dispose(), summary() }`；`factory({ THREE, root, layout, materials, collision, canvasTex, low })` 返回 `{ dispose() }`；**每个模块 `try/catch` 隔离，出错只跳过该模块并记录**；`buildAll` 末尾对**所有模块的静态网格按材质合并**（沿用 `dr-campus-registry.js` S2-4b 的合并思路，**不 import 它**；动态件保持独立；命名 `office2-<模块>-<部件>`）。`root.name = 'office2-root'`，整体可开关。
2. 新增 `office-v2-modules.js`：导出模块清单（`['shell', …]`、`['furniture', …]`）；**把 O3 外壳与 O4 家具改为经注册口创建**（行为与 O4 验收时逐数据一致）；**预留（不实现）`bar`、`displayStaff` 两个槽位的登记行（注释说明由 Trae 的 O6 / O7 模块接入）**。
3. `app.js`：把 O3 / O4 现有接线收拢为「创建注册表 → 登记清单 → `buildAll`」，**净增接线 ≤ 10 行（逐行列出）**；`window.__office.officeV2 = registry`；`?layout=2` 之外**不创建任何对象**；失败回退布局一。
4. **预算与回归**：`?layout=2` 同机位切换 `office2-root` 可见性的精确增量，应不高于 O4 验收时的数字；默认页面逐数据不变；25 人路线 / 小橘 / T16b 压力测试仍全过。
5. 测试：注册表单模块抛错不影响其它（假 factory）；合并后包围盒与可见性开关正确；静态检查（无 `dr-campus` / `dr-console` 引用、无深蓝科技色字面量、`app.js` 新增 ≤ 10 行）。全量测试全过，不得放宽。

## 汇报
「做到 / 没做到 / 未验证」，与磁盘一致；贴 `app.js` 接线行与精确增量对照表。**不要自己重启服务。**
