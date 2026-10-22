# L1c-contract-template-in-dispatch：派发面板里的「任务契约」模板与灰度提示（约 1–1.5 小时）

**执行者：Trae（新会话）。主线。改 `ui.js`（派发面板 `paneNew`）与 `server.mjs`（`create_issue` 的响应补充，互斥：此时没有别的 `server.mjs` 任务）。** **前置：L1a / L1a-fix（`task-contract.mjs`）、L1b（契约视图）已验收。** 先读：`_common.md`、`_lane-main.md`、`task-contract.mjs`（12 字段、`contractTemplate / parseContract / validateContract`）、知识库 `E:\VirtualAIOffice\knowledge\流程\模板\任务契约.md`、`ui.js` 里 `openDispatch / paneNew`（约第 368–415 行）、`server.mjs` 里 `create_issue`（约第 362 行）。开工先备份 `ui.js`、`server.mjs`、`index.html`（如改）到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-l1c`（**上一级目录，必须备份**）。

**目的：** 让董事会派发任务时**顺手写出契约**，这样 `/contract-view` 的汇总才有数据（真实数据现在是 80 个任务全是「无契约」）。**灰度：只提示，不强制，不阻止派发。**

## 重要的技术约束
- `task-contract.mjs` 引用 `standup.mjs`（服务端模块，含 Node 依赖），**不能直接在浏览器里加载**。所以：**浏览器端只做「把表单字段格式化成契约文本」**（一个 ≤ 40 行的小函数，放在 `ui.js` 内或新增 `contract-format.js`（**浏览器安全，不 import 任何服务端模块**），格式必须与 `contractTemplate` 的输出**逐字符同构**，并在测试里用 `parseContract` 回读验证往返一致）；**校验只在服务端做**。

## 要做的事
1. **表单**：`paneNew` 里「说明」下方加一个可折叠区块「任务契约（建议填写）」，默认折叠；展开后是 12 个字段的输入（项目预填当前所选项目名；目标、允许修改、禁止、依赖、输入版本、验收标准（每行一条）、工具权限、预算上限、交付物、审核责任人、风险等级下拉：低 / 中 / 高 / 资金）；每个字段有一句占位提示（取自模板）。**勾选「资金类」时风险等级自动设为「资金」并锁定**。
2. **生成**：有任意契约字段被填写时，派发前把格式化后的「【任务契约】…」区块**追加到说明末尾**（说明与契约之间空一行）；**没填任何契约字段时说明原样发送，行为与现在逐字节一致**。
3. **灰度提示（服务端）**：`create_issue` 在 `contract-view.json` 开启时，对最终 `description` 调用 `parseContract / validateContract`，把结果作为**附加字段** `contractCheck: { state: 'complete'|'incomplete'|'none', errors:[{field, code}] }` 放进响应；**不影响创建**（缺项也照常创建）；**开关关闭时响应与现在逐字节一致**。UI 收到后用 toast 显示「已派发；契约完整」或「已派发；契约缺 N 项：目标、验收标准…」，**文案不得出现「拒绝 / 失败 / 必须」**。
4. **文案与隔离**：不读取、不写入任何密钥；契约文本只进任务说明（已有的写入路径），**不写入任何新文件**；不增加轮询；不新增 `/act` 类型。
5. **界面验证（必须）**：改了 `ui.js` 之后，**在浏览器里打开页面**确认：加载遮罩消失、没有红色错误条、控制台 0 错误；打开「派发任务」面板，展开契约区块，填写后派发一个测试任务**之前先问董事会**（不得自行向 Paperclip 创建真实任务；用单元测试与模拟 `post` 覆盖提交路径）。

## 测试与验收
- 纯函数：格式化输出与 `contractTemplate` 同构；`parseContract(格式化结果)` 回读与输入字段一致；空字段不生成区块；资金类联动；特殊字符（换行 / 冒号 / 尖括号）处理，**不产生第二个契约区块**。
- 服务端：开关关闭 → 响应不含 `contractCheck`（快照对比）；开启 → 完整 / 缺项 / 无 三态；缺项不阻止创建（用模拟 `send` 断言仍发出创建请求）。
- 静态检查：新增代码不含 `innerHTML` 拼接外部数据（表单值一律 `textContent` / `value`）、`eval`、`fetch(` 到外部域。
- `node --test tests/*.test.mjs` 全过；`node --check` / `--input-type=module --check`。**不要自己重启服务**（我来重启后做界面与接口验收）。汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `ui.js` / `server.mjs` 改动行；**写出浏览器验证结果**。
