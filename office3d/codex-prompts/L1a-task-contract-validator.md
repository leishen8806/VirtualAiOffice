# L1a-task-contract-validator：任务契约模板与校验器（纯模块，约 1 小时）

**执行者：Trae（新会话）。主线。** 先读：`_common.md`、`_lane-main.md`、知识库 `E:\VirtualAIOffice\knowledge\项目\现状盘点与融合策略.md` **第八、九节**（自发管理定义、L1 追加验收）、知识库 `流程\模板\交接包.md` 与 `流程\模板\验收证据.md`（已有模板的口径）、`standup.mjs` 里的 `MONEY_RE`（资金类判定，复用不要另写）、`handoff.mjs` 的 `parseHandoff`（解析风格参照）。

**允许新增：** `task-contract.mjs`、`tests\task-contract.test.mjs`；`README.md` 末尾追加一节「任务契约（L1a）」。**不要改其它已有文件；不接路由；不对 Paperclip 发任何请求；不读写任何文件（纯函数）。**

## 背景
自发管理要求「一条任务不能只有标题和描述」。本任务只做**契约的格式、解析与校验**（L1b 才接治理中心）。契约写在任务描述里的一个固定区块，**既给人读，也给程序检查**。

## 契约区块格式（`【任务契约】` 起，到空行 + 下一个 `【` 标题或文末止）
```
【任务契约】
项目: Virtual AI Office
目标: 为「前厅公告」面板补充加载与错误状态
允许修改: office3d/foyer-panels.js, office3d/tests/foyer-panels.test.mjs
禁止: 不改接口、不改权限、不改 server.mjs
依赖: CMP-301, CMP-305
输入版本: git:E:\VirtualAIOffice\paperclip-ops@abc1234
验收标准:
- 加载失败时显示固定中文提示
- 新增测试覆盖三种状态
工具权限: 读写工作区文件, 运行测试
预算上限: 运行 ≤ 5 次 / 耗时 ≤ 90 分钟
交付物: 变更说明, 测试输出
审核责任人: Reviewer1
风险等级: 低
```
（字段名固定为上面 12 个中文标签；行内以 `, ` 或 `、` 分隔的列表；`验收标准:` 后可跟若干 `- ` 行。）

## 要做的事（全部纯函数）
1. **`CONTRACT_FIELDS`**：12 个字段的定义（标签、是否必填、类型 `text | list | bullets`、说明）。**必填**：项目、目标、允许修改、禁止、验收标准、预算上限、交付物、审核责任人、风险等级；**选填**：依赖、输入版本、工具权限。
2. **`contractTemplate({ project })`** → 返回上面格式的**空白模板字符串**（所有标签都在，值为占位）。
3. **`parseContract(description)`** → `{ found, contract, errors }`：容错解析（全角冒号 / 半角冒号、多余空格、字段乱序、缺字段不抛异常）；`contract` 的列表字段是**已清洗的数组**（去空、去重、限长）；**描述里没有区块 → `found:false`**。**所有来自描述的文本当不可信输入：去控制字符、每项 ≤ 200 字、列表 ≤ 20 项。**
4. **`validateContract(contract, ctx)`** → `{ ok, errors: [{ field, code, message }], warnings: [...], completeness }`，`completeness` 为 0–100（必填项满分 80 + 选填 20，**不得因为字段「存在但是占位 / 空话」而给满分**）。校验至少包括：必填缺失；`允许修改` 为空或**含全盘通配**（`*`、`**`、`.`、`/`、`E:\`、`C:\` 这类）→ 错误；`允许修改` 含 `server.mjs / lan.json / telegram / *.dpapi / config.json` 等**受保护路径**而 `风险等级` 不是「高」→ 错误；`验收标准` 少于 1 条或全是「完成 / 无」这类**无法检查的空话** → 错误（给出空话词表常量，可测试）；`预算上限` 无法解析出任何数值（次数 / 分钟 / token）→ 错误；`风险等级 ∈ { 低, 中, 高, 资金 }`；**描述 / 目标命中 `MONEY_RE`（资金类）而风险等级不是「资金」→ 错误**；`依赖` 项必须匹配 `^[A-Z]{2,5}-\d{1,6}$`；`审核责任人` 与（若 `ctx.assignee` 提供）**执行者相同 → 错误**（自己不能审核自己的交付）。
5. **`isLowRiskBatchEligible(contract)`**：支持「批准一批边界明确的低风险任务」——**同时满足**：`风险等级=低`、`允许修改` 非空且无通配 / 无受保护路径、`预算上限` 可解析、`验收标准` ≥ 2 条、不命中 `MONEY_RE`、`禁止` 非空 → `true`；返回 `{ eligible, reasons }`（不合格给出每条原因）。
6. **`parentCanComplete({ parent, children, integrationEvidence })`**：**父任务不能仅因子任务全部完成就自动完成**——只有 `children` 全部为完成状态 **且** `integrationEvidence`（对父任务原验收标准的整体集成验证记录，布尔 + 引用）为真才返回 `{ ok:true }`，否则返回 `{ ok:false, missing: [...] }`；子任务为空 / 有取消的也要给出明确结论（取消不计入完成，需说明）。
7. **`summarizeContract(contract)`** → 一行安全摘要（供日志 / 面板，不含正文 > 80 字）。

## 测试（`tests/task-contract.test.mjs`）
- 模板往返：`contractTemplate` → 填值 → `parseContract` → `validateContract` 通过；缺每个必填字段各一例；全角 / 半角冒号；字段乱序；描述里无区块；区块在描述中部；多个区块只取第一个。
- 通配与受保护路径、空话验收标准、预算解析（`运行 ≤ 5 次 / 耗时 ≤ 90 分钟`、`≤ 20000 token`、纯文字「看情况」）、资金类关键词、依赖格式、自己审核自己。
- `completeness`：满分合同 = 100；占位合同 < 50。
- 低风险批量资格：合格 / 各一项不合格的 6 个反例。
- `parentCanComplete`：全完成无集成证据 → 不可完成；有证据 → 可完成；含取消子任务；空子任务。
- 容错与安全：10 MB 描述、控制字符、1000 项列表、嵌套标签、HTML；**确定性**；**静态检查**：不含 `fetch / Date.now / Math.random / innerHTML / eval / child_process`，不 import 业务模块（**只允许** `import { MONEY_RE } from './standup.mjs'`）。
- 全量 `node --test tests/*.test.mjs` 全过。

## 验收与汇报
`node --check task-contract.mjs`；全量测试全过；汇报「做到 / 没做到 / 未验证」且与磁盘一致；列出你对「空话词表」「受保护路径表」的取值，便于董事会审阅。
