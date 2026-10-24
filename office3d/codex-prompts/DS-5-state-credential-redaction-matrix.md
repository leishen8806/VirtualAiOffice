---
id: DS-5
base: office3d/rev-20261022
branch: ds/DS-5-state-credential-redaction-matrix
scope:
  - office3d/tests/state-credential-redaction-matrix.test.mjs
budget: 2h
---
# DS-5：为 `stripStateCredentials` 补「键名矩阵」测试，并报告漏网与误伤（只加测试，不改被测代码）

`office3d/state-last-good.mjs` 导出 `stripStateCredentials(value)`：递归删除对象里**键名匹配凭据正则**的字段（`credential` 正则在文件开头）。它是「快照与局域网 / 大屏输出不得带凭据」的最后一道防线，目前只有一两条例子测试（`tests/state-last-good.test.mjs` 里 `credentials are stripped recursively…`）。**先完整读被测源码与该测试，不重复。** 本卡用一张**键名矩阵**把它的真实边界固定下来，并把「该删没删」与「不该删却删了」的情形报告出来。

## 要做的事
1. 新建 `office3d/tests/state-credential-redaction-matrix.test.mjs`（`node:test` + `node:assert/strict`，风格参考同目录测试）。支持环境变量 `STATE_LAST_GOOD_MODULE` 指向副本（默认读 `../state-last-good.mjs`），用于变异自检。
2. **矩阵一：必须被删除的键名（至少 40 个）。** 覆盖：`token`、`accessToken`、`access_token`、`ACCESS-TOKEN`、`refreshToken`、`password`、`passwd`、`passphrase`、`secret`、`clientSecret`、`apiKey`、`api_key`、`API-KEY`、`accessKey`、`access_code`、`authorization`、`Authorization`、`cookie`、`Set-Cookie`、`csrfToken`、`jwt`、`bearer`、`credential`、`credentials`、`actToken`、中文键名（源码正则里列出的那几个）等；每个键都放在**顶层、嵌套对象、数组元素里的对象、三层深**四个位置各测一次。断言：键被删，同层其它字段保留，且输出里搜不到该键的值。
3. **矩阵二：必须保留的普通键名（至少 25 个）。** 如 `name`、`status`、`at`、`agents`、`tasks`、`title`、`costCents` 等业务键，以及**含有 `token` 字样但属于统计数据的键**（如 `inputTokens`、`outputTokens`、`cachedInputTokens`、`maxTokens`）——**先读源码判断它们按当前正则会被删还是保留，然后用断言固定「当前实际行为」**，并在报告里单列：哪些统计键被误伤（被删），后果是什么（例如成本面板缺字段）。**不要为了好看去改被测代码。**
4. **矩阵三：该删但可能漏网的变体（至少 15 个，只报告不修）：** 如 `to-ken`、`tok3n`、`TOKEN`（大写）、带零宽字符的键、`pass_word`、`pwd`、`private_key`、`privateKey`、`sessionId`、`session_secret_value`、`x-api-key`、`proxy-authorization`、`otp`、`pin`、`seed`、`mnemonic`。逐个用断言固定当前行为（删 / 不删），报告里列出**当前不会被删的敏感变体清单**，这是本卡最重要的产出。
5. **其它性质：** 不读取凭据键的 getter（用会抛错的 getter 作为凭据键，断言不抛）；不修改入参（深度冻结后调用不抛错）；数组顺序与非凭据字段的值（含 `null`、数字、布尔）原样保留；循环引用 / 超深嵌套（如 5000 层）按当前行为固定（不抛或抛什么都用断言写清）。
6. 只新增 `scope` 里的一个文件，**不改 `state-last-good.mjs` 或任何其它文件**。

## 验收标准（在干净的仓库副本里运行）
```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/state-credential-redaction-matrix.test.mjs tests/state-last-good.test.mjs
```
- 全部通过（含原有 `state-last-good.test.mjs`；其中若有因缺少本机运行数据文件而在干净副本里失败的用例，如实写进报告，不要去修）。
- 变异自检（在系统临时目录的 `.mjs` 副本上做，副本需能解析被测文件的 `node:fs` 导入；通过 `STATE_LAST_GOOD_MODULE` 指向）：至少 6 种，例如：去掉正则里的 `token`、去掉 `password`、去掉 `cookie`、把 `Object.keys` 递归改成只处理顶层、数组分支不再递归、去掉 `filter` 使其不删任何键。每种都必须让对应矩阵测试变红；做完删副本，`git diff` 里被测文件无改动。报告里贴每种变异的变红摘要，**并确认每种变异确实改动了副本**（用 `diff` 输出行数或哈希变化证明，防止「没改动也报变红」）。

## 不做的事
不安装依赖、不联网、不下载素材；不碰 `app.js / ui.js / index.html / server.mjs`；不推 `main`、不 force；报告里不得出现任何真实密钥、IP、本机路径或账号（矩阵里的值一律用明显的假值如 `fixture-1`）。

## 交付
- 分支 `ds/DS-5-state-credential-redaction-matrix`，推送后把分支名告诉派发人。
- 同一分支新增 `dispatch/deepseek/outbox/DS-5-report.md`：做到 / 没做到 / 未验证；改动文件与行数；测试命令与输出末尾；每种变异结果（含改动证明）；**「当前不会被删的敏感变体」清单**与**「被误伤的统计键」清单**；范围外发现。
- 完成后停下，等待规划者验收。
