# O7-fix-canvastex-contract：展示部门 / 展示人物与主场景 `canvasTex` 接口不一致（小卡，约 30 分钟）

**执行者：Trae（办公区产线，O7 同一会话）。** **只修这一个问题，不加功能。** 这是 Codex 在做 O6O7 接入时发现并停下的契约不一致，它没有改任何产品文件（见 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-o6o7\blocker-report.json`）。先读：`_common.md`、`display-staff-mesh.js`、`display-departments.js`、`display-staff.js`、`tests\display-staff.test.mjs`、`app.js` 第 98–108 行的 `canvasTex`（**只读，不改 `app.js`**）、`office-furniture-v2.js` 第 43 行与 `office-layout-v2-scene.js` 第 62–70 行（它们是按真实契约调用 `canvasTex` 的参考写法）。

## 问题（已复现）
主场景的 `canvasTex(w, h, draw, repeat, srgb)` 内部是 `draw(c.getContext('2d'), w, h)`——**`draw` 收到的是 2D 绘图上下文**，返回 `CanvasTexture`。而 `display-staff-mesh.js` 的 `displayAtlas` 把 `draw` 写成 `draw(canvas)`（里面再 `canvas.getContext('2d')`）。预览页没有传 `canvasTex`，走的是文件里自己 `document.createElement('canvas')` 的备用分支，所以一直没暴露；一旦用主场景的真实 `canvasTex`：
- `buildDisplayDepartments` 抛 `TypeError: canvas.getContext is not a function`；
- `buildDisplayStaff` 进入 `failure = 'DISPLAY_UNAVAILABLE'`，人物数 0。
测试里要么不传 `canvasTex`、要么传一个直接抛错的假函数，从来没有按真实契约跑过。

## 要做的事
1. **修 `displayAtlas`（`display-staff-mesh.js`）**：使 `draw` 同时满足两种调用：真实契约 `draw(ctx, width, height)`（`canvasTex` 分支，**这是主路径**），以及备用分支（自建画布时，自己取 `getContext('2d')` 后以同样的 `(ctx, width, height)` 调用）。两个分支共用同一个绘制函数，画布尺寸只在备用分支里设置（`canvasTex` 分支的宽高由 `canvasTex(w, h, ...)` 的参数决定）。
2. **检查其它调用点**：`office-bar.js`、`display-departments.js`、`display-staff.js`、预览页，凡是传入或调用 `canvasTex` 的地方，全部按真实契约核对；不得有其它 `draw(canvas)` 假设。**列出你检查过的每个调用点。**
3. **测试按真实契约补齐（不放宽已有断言）：** 在 `tests\display-staff.test.mjs`（必要时 `tests\office-bar.test.mjs`）新增一个**忠实模拟 `app.js` 的 `canvasTex` 的测试替身**：创建一个带 `getContext('2d')` 的假画布（记录 `fillRect / fillText / font / fillStyle` 调用），调用 `draw(假ctx, w, h)`，返回一个带 `colorSpace` 属性的假纹理。用它验证：
   - `displayAtlas` 以 `(ctx, w, h)` 调用 `draw`，且确实写入了文字（部门名、`展示部门 · 模拟角色`）；
   - `buildDisplayDepartments` 用该替身构建成功，不抛错；
   - `buildDisplayStaff({ config: { enabled: true }, canvasTex: 替身 })` 创建 12 个人物，`summary().failure === null`，`count === 12`，高档 calls ≤ 2；
   - 低档仍不创建人物；
   - 没有传 `canvasTex` 且无 `document` 时返回 `null` 而不是抛错（保持既有行为）。
   同一个替身也用于 `buildOfficeBar`（如它使用 `canvasTex`），确认吧台创建成功。
4. **预览页回归**：`display-staff-preview.html` / `office-bar-preview.html` 仍在浏览器正常打开、控制台 0 错误、读数不高于 O6 / O7 验收时的数字（吧台高档 3 calls / 低档 1；展示人物高档 +2 calls、低档 +0）。截图一张。
5. 全量 `node --test` 全过，不放宽任何断言。

## 约束
- **不改 `app.js`、`office-v2-modules.js`、`office-v2-registry.js`**（接入由 Codex 完成，那三个文件现在属于 Codex 会话）。
- 只改 Trae 自己的 O6 / O7 文件和它们的测试。备份要改的文件到上一级目录 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-o7fix`（不放进 `office3d`）。
- 不读取或打印任何密钥，不自己重启服务，不改任何开关。

## 汇报
「做到 / 没做到 / 未验证」，与磁盘一致；列出改动文件与行数、所有 `canvasTex` 调用点的核对清单、新增测试名称。**停下等我验收**——我验收通过后会通知 Codex 会话一继续 O6O7 接入。
