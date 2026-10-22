# C4-command-view-page：指挥视图二维页面（演示可看、live 空状态）+ 治理中心入口钩子（约 1.5–2 小时）

**执行者：Trae（新会话）。主线。** **前置：C3 已验收（`/command-view`、`/command-view/scenarios` 可用，开关开启时）。** 先读：`_common.md`、`_lane-main.md`、`docs\command-view-plan.md` 第 3、4、6、8、9 节（字段、阶段、焦点、成本、模式与 UI 规格）、`home.html` + `home-page.js` + `home-inventory.html`（独立页面写法、深浅主题、页面隐藏暂停）、`ui.js` 里治理中心入口（**只读参考**）。**这是 Helix 指挥视图（办公室产品的管理视图），不是仓配中控台：配色 / 组件不得与 `dr-console*` 共用。**

**允许新增：** `command-view.html`、`command-view.js`（页面入口与渲染）、`command-view-render.mjs`（**纯渲染辅助：把 `CommandViewData` 转成展示行 / 标签 / 文案，Node 可测**；浏览器用的 `.js` 副本须有「两份一致」测试，或直接只用 `.js` 并让测试 `import()` 它）、`tests\command-view-render.test.mjs`、`tests\command-view-static.test.mjs`；**`ui.js` / `index.html` 最小入口钩子 ≤ 10 行（逐行列出）**；README 一节。**不要改** `app.js`、`server.mjs`。备份 `ui.js`、`index.html` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-c4`（上一级目录，必须备份）。

## 要做的事
1. **页面**（`http://office.localhost:3200/command-view.html`）：顶部总览（公司 / 范围 / 模式 / 成本卡 / 数据质量 / 更新时间）；左任务队列（阶段标签、`rawStatus`、下一处理人、等待原因；最多 20 行可见 + 筛选）；中间「关系」三个标签（组织 / 依赖 / 调用，**调用无可靠源时显示「暂无可靠调用链」，不画线**）；右执行详情（运行、版本证据摘要、**没有证据的阶段明确显示「待验证（无证据）」**）；底部事件时间线（缺步骤显示「未知步骤」缺口）。**所有数字与状态只来自 `/command-view` 响应，页面不自己算业务结论。**
2. **模式与场景**：默认选 `demo`（页面顶部常驻醒目的「合成演示 · 非真实数据」）；场景下拉（来自 `/command-view/scenarios`）+ 时间片步进（上一步 / 下一步 / 自动播放，≥ 1.5 s 间隔，`document.hidden` 暂停，`prefers-reduced-motion` 关闭自动播放）；`live` 选项存在，**选中后显示空状态「尚未授权 live 数据范围」**（不得回退到演示数据）；开关关闭（接口 404）→ 页面显示「指挥视图未开启（本机管理员可在服务端开启）」，不报错。
3. **未知 / 过期的呈现**：`value:null` 一律显示「未知」+ 原因文案（`reason` 映射为中文短句，未知原因码显示「原因未归类」）；成本卡「已确认成本｜未返回用量的执行数｜最后更新时间」；`quality.freshness.stale` 或 `animationAllowed:false` → 顶部「更新中断」并停用所有动效；**颜色必须带文字与图标，不靠颜色单独传达**（绿 = 有效验收 / 恢复，琥珀 = 等待决策，红 = 明确失败，灰 = 未知 / 失效，蓝 = 执行）。
4. **主题与响应式**：浅色（纸质，`#f4f6f8` 起）与深色（`#101820` 起）两套，**布局与语义一致**；宽屏 1440 / 1280 / 1024 / 平板 768 / 手机 390：手机改标签页切换（队列 / 详情 / 时间线），触摸目标 ≥ 44 px，无文档级横向滚动；键盘 Tab / Esc、`aria-label` 齐全。
5. **入口钩子**：治理中心里加一个「指挥视图」入口（`ui.js` ≤ 10 行，新标签页打开 `/command-view.html`，`noopener`）；**入口仅在本机完全访问时显示**（沿用 A6 的 `canShowHomeEntry` 思路：`actToken` 存在且非局域网、非大屏）。**改完 `ui.js` 必须在真实浏览器确认：加载遮罩消失、无红色错误条、控制台 0 错误、入口点击打开新页面。**
6. **隔离**：页面只请求同源 `/command-view*`；不用 `localStorage / cookie` 存任何业务数据（主题偏好可存 `localStorage`，包 `try/catch`）；`innerHTML` 一律不拼外部数据（用 `textContent` / DOM 构造）；无外部域、无外部字体。

## 测试与验收
- 渲染辅助纯函数测试：阶段 / 原因码 / 未知值 / 成本卡 / 等待时长格式化；`pending_verification` 文案；颜色语义映射表；静态检查同 C2。
- **浏览器（Playwright，页面聚焦；我会重启并临时开启 `command-view.json` 后复验）：** 三个场景全部时间片逐步截图（至少 `demo-journey` 的 6 步），1440 / 1280 / 768 / 390 四种宽度、深浅主题各一组；live 空状态；开关关闭状态；`document.hidden` 暂停；网络面板确认**只有 `/command-view*` 与静态资源**；控制台 0 应用错误；主页面加载遮罩消失、无错误条、入口可用。**每一项浏览器验证写出真实结果，没做的写「未验证」。**
- `node --test tests/*.test.mjs` 全过；汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `ui.js` / `index.html` 钩子行。**不要自己重启服务。**
