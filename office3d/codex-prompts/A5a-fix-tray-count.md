# A5a-fix：托盘「剩余数」计算错误，导致放了任何东西后所有物品都不能再选（只改 `home-editor-logic.mjs` 与其测试，约 20 分钟）

**执行者：Trae（接在 A5a 之后，同一会话即可；做完停下等验收）。** 开工先备份 `home-editor-logic.mjs`、`tests\home-editor-logic.test.mjs` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-a5a-fix`（上一级目录）。**只允许改这两个文件**（如需让页面演示布局的展示更合理，另列出）。

## 缺陷（董事会侧用真实页面复现）
`trayModel(inventory, layout)` 里：
```js
const used = inventory.filter((entry) => placed.has(entry.itemInstanceId)).length
```
**没有按 `itemId` 过滤**：只要布局里摆了任意物品，每一种物品的「已摆放数」都会被算成「全部已摆放的件数」。后果：演示布局摆了 11 件后，托盘上木椅显示 **「木椅 -8/3」**（剩余 −8），**所有物品按钮都被禁用**，用 Playwright 点托盘会超时（`element is not enabled`）。也就是说**页面里的编辑器放完演示布局后根本无法再放置任何东西**。已用独立脚本复现：摆 1 把椅子 + 1 张床 → 床 `placed: 2, remaining: -1`。单元测试没有覆盖「多种物品同时摆放」。

## 要求
1. `used` 改为**只统计同一 `itemId`** 的已摆放实例（`entry.itemId === itemId && placed.has(entry.itemInstanceId)`）；`remaining = owned - used`，**不会为负**（若数据异常导致为负，钳到 0 并在返回里加 `inconsistent: true`）。
2. 新增测试（必须）：① 摆 `chair_wood#1` + `bed_single#1` → 椅子 `placed 1 / remaining 2`，床 `placed 1 / remaining 0 / disabled`，**其余 10 种不变**；② 演示布局（`home-page.js` 里的 11 件）→ 没有任何一种出现负数，**木椅 remaining 至少为 `owned - 已摆放的木椅数`**；③ 摆满一种后删除一件 → 该种 remaining 恢复、其他种不变；④ 空布局 → 起始库存数量（`chair_wood 3 / plant_pot 2 / frame_art 2`，其余 1）。
3. **再检查同类问题**：`home-editor.js` 里选中 / 预览 / 删除 / 撤销路径有没有类似的「跨物品计数」或「按下标而非按 id」的假设；发现就一并修并写测试。
4. **浏览器验证（必须，Playwright 或浏览器）**：打开 `home.html` → 编辑 → 托盘**没有按钮显示负数**；选「木椅」→ 悬停多个位置，消息区出现不同的原因文案（至少看到「会挡住入口」「超出房间」「与已有物品重叠」之一，以及合法位置的空消息）→ 在合法位置点击放下 → 撤销 / 重做 → 完成；全程控制台 0 错误、**无任何接口请求**。把结果写进汇报。
5. 全量测试全过；汇报「做到 / 没做到 / 未验证」，与磁盘一致。**不要自己重启服务。**
