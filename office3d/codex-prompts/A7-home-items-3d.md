# A7-home-items-3d：个人空间 12 件物品的 3D 程序化模型（独立模块，不改 `app.js`，约 1 小时）

**执行者：Codex（新会话）。小镇线 · 场景。** 先读：`_common.md`、`_lane-town.md`、**`docs\home-space-spec.md`（12 件物品的尺寸、层、占用格——唯一规格）**、`app.js` 里 `furn(...)`、`makeLoungeSofa(...)`、前厅 / 广场程序化模型的写法（风格、材质、`canvasTex`）、`office-layout.js`、`vendor\` 里的 Three.js 版本。

**允许新增：** `home-items-3d.js`、`home-items-gallery.html`（**独立静态调试页**，无需改 `app.js` 即可目视检查模型）、`tests\home-items-3d.test.mjs`；`README.md` 追加一节「个人空间物品模型（A7）」。**不要改**：`app.js`、`ui.js`、`index.html`、`server.mjs`、`quality.js`、所有已有文件。**不需要重启服务；不得向 Paperclip 发请求；不引入外部素材 / 联网。**

## 要做的事
1. **`home-items-3d.js`**（ES 模块，浏览器与 Node 都应能 import；`THREE` 由调用方传入，模块本身不 import 它）：
   - `buildItem(THREE, itemId, { materials })` → `THREE.Group`：**坐标约定**：Group 原点在**占用矩形的中心、地面 `y=0`**；模型朝向「正面朝南（+z）」（`rot=0`），由调用方整体旋转 `rot`；**包围盒必须落在 `footprint × 0.5 m` 之内（允许 ±0.03 m 容差），高度不超过规格 `height + 0.05`**。
   - 12 种物品都要有**可辨认的外形**（程序化几何：圆角盒、圆柱、球、平面 + Canvas 贴图），**风格与办公室一致**（偏写实、冷暖适中、不要像素风 / 低多边形卡通）：床（床架 + 床垫 + 枕头）、双人沙发（座垫 + 靠背 + 扶手）、餐桌（桌面 + 四腿）、木椅（座面 + 靠背 + 四腿）、书桌、衣柜（柜体 + 双门 + 把手）、书架（多层隔板 + 少量书脊色块）、电视柜（柜体 + 电视平面）、盆栽（花盆 + 叶丛）、落地灯（灯杆 + 灯罩，**灯罩只用自发光材质，不新增任何 `THREE.Light`**）、圆形地毯（薄圆盘 + 花纹贴图）、挂画（画框 + Canvas 画面）。
   - **`createMaterials(THREE)`**：共享材质表（木 / 布 / 金属 / 叶 / 玻璃…），**同类物品共用材质以便合并**；**不新增光源**；**颜色空间与现有场景一致**。
   - **`ITEM_STATS`**：每件物品的 `meshes`（网格数）、`triangles`（三角形数）、`materials`；**预算**：每件 ≤ **8 个网格 / ≤ 1,500 三角形**，12 件合计 ≤ **60 个网格 / ≤ 12,000 三角形**。
   - **`mergeItemStatic(THREE, group)`**（可选）：把同材质子网格合并成一个，减少绘制调用；**合并后包围盒不变**。
   - `disposeItem(group)`：释放几何与（非共享）材质，不泄漏。
2. **`home-items-gallery.html`**：独立页面（沿用 `town.html` 的最简结构，`<script type="module">` 引用 `vendor` 的 Three 与 `home-items-3d.js`），**一次排开 12 件物品**，下方显示名称与占用格尺寸，画出 `0.5 m` 网格与每件物品的**占用矩形线框**，用于目视核对「模型与占用格是否一致」；可轨道旋转（用现有 `vendor` 的控制器或最简手写）；**不请求任何服务端接口**；深浅主题都可看清；允许通过静态服务访问 `http://office.localhost:3200/home-items-gallery.html`。
3. 不接入主场景（A4 才接）。

## 测试（`tests/home-items-3d.test.mjs`）
- 若 Three.js 能在 Node 下 import（先试 `vendor` 路径；不行就用 `three` 的 ES 构建在 Node 下的 `import()`，**仍不行则把几何构建拆成「纯数据描述 → 网格」两步，测试纯数据描述**，并在汇报里说明）：对 12 件物品逐个 `buildItem`，断言**包围盒在占用矩形内（±0.03）**、高度、网格数 / 三角形数不超预算、**不含任何 Light 对象**、`rot` 90 / 270 时调用方旋转后的包围盒与交换后的占用格一致。
- 目录一致性：`ITEM_IDS`（来自 `town\home-catalog.mjs`，**若 A1 尚未落地则从 `docs\home-space-spec.md` 解析 12 个 id，并在 A1 落地后改为直接引用**）每一项都有对应模型；没有多余模型。
- 静态检查：不含 `fetch / Math.random / innerHTML / eval`；`app.js` 未被改动（对比备份）；无 `buy / price / balance / wallet`。
- 全量 `node --test tests/*.test.mjs` 全过。

## 验收（缺一不通过）
- 全量测试全过；`node --input-type=module --check < home-items-3d.js`。
- **浏览器实测**（Playwright 或浏览器面板，页面保持聚焦）：打开 `home-items-gallery.html`，**12 件物品的截图（俯视 + 斜 45°，深 / 浅主题各一张）**；控制台 0 错误；用画廊页的数字确认**网格数 / 三角形数**与 `ITEM_STATS` 一致。
- 汇报「做到 / 没做到 / 未验证」且与磁盘一致；**列出每件物品的网格数 / 三角形数表**；**说明哪些物品你认为在 0.5 m 网格内表现力不足，建议如何调整规格**（只提建议，不要改 `docs\home-space-spec.md`）。**不要自己重启服务。**
