# O6b-bar-material-hooks：吧台模块开放「材质替换口」，让贴图能接进去（小卡，约 30–45 分钟）

**执行者：Trae（办公区产线；只改自己的 `office-bar.js` 及其测试 / 预览页，不改 `app.js`、`office-v2-*`、`office-layout-v2-scene.js`）。** **前置：O6 / O7-fix 已通过。** 背景：AS2-1 要把胡桃木、奶油织物贴图接到吧台上，但吧台的材质目前是模块内部创建的（`opaque / glass / glow`），Codex 不能改你的文件。本卡让吧台**由调用方提供可选的材质与 UV 口**，没有提供时行为与现在逐项一致。

先读：`_common.md`、`office-bar.js`、`office-bar-geometry.js`、`tests\office-bar.test.mjs`、`office-bar-preview.html`、`office-theme-v2.js`。

## 要做的事
1. `buildOfficeBar({ …, materialOverrides })` 新增**可选**参数 `materialOverrides = { top, face, seat, sofa }`（每项为 `THREE.Material` 或 `undefined`）：吧台台面、立面、吧凳座面、沙发用调用方的材质；未提供的沿用现有主题色材质。**默认调用（不传）时，三角形、calls、颜色、名称与现在逐项一致**（写对照测试）。
2. **UV 口**：台面与立面当前用无 UV 或默认 UV 的合并几何。请给吧台的台面 / 立面 / 沙发 **按世界坐标平面投影生成 `uv` 属性**（周期参数 `uvScale = { top, face, sofa }` 米，默认 `1.2 / 1.2 / 0.6`），使贴图平铺不拉伸；**不传 `materialOverrides` 时多出的 `uv` 属性不得增加 calls，也不得改变现有渲染**（材质本身不用贴图时 UV 不起作用）。
3. 释放：`dispose()` 只释放**自己创建**的材质与几何，**不释放调用方传入的材质**（由调用方负责）。写测试（传入材质 dispose 后仍可用）。
4. 预览页 `office-bar-preview.html` 新增一个开关「用胡桃木 / 织物测试材质」（程序里用 `canvas` 生成两张简单测试纹理即可，**不依赖 AS2-0 的贴图文件**），目视确认 UV 周期正确、木纹方向沿台面弧线切向；高档仍是 **3 calls / 4,880 三角形（默认）**，低档 **1 call / 1,712**。
5. 全量 `node --max-old-space-size=2048 --test --test-timeout=60000` 全过，不放宽断言；预览页浅 / 深各一张截图，控制台 0 错误，只请求静态资源。
6. 备份 `office-bar.js`、`tests\office-bar.test.mjs`、`office-bar-preview.html` 到上一级目录 `office3d-backup-o6b`；不读取或打印密钥，不重启服务。「做到 / 没做到 / 未验证」，**停下等我验收**。
