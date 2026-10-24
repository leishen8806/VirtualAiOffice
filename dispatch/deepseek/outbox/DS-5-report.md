# DS-5 汇报：`stripStateCredentials` 键名矩阵（漏网与误伤）

- 状态：**待验收**
- 分支：`ds/DS-5-state-credential-redaction-matrix`
- 基线：`office3d/rev-20261022` @ `47efb7e3b565eaba7d45c61cdf206145599e69bd`
- PR：**未开**（本机没有 `gh` / GitHub token；按卡片把分支名交给派发人）
- 卡片：`dispatch/deepseek/inbox/DS-5-state-credential-redaction-matrix.md`

## 做到

新增 `office3d/tests/state-credential-redaction-matrix.test.mjs`（210 行，8 个 test，47 处 `assert` 调用点；矩阵循环内断言 > 1200 个点），只加测试、不改被测代码。测试支持 `STATE_LAST_GOOD_MODULE` 指向副本，默认读 `../state-last-good.mjs`。

三张表全部用断言固定**当前真实行为**：

1. **表一：必须删除的键名（51 个）**，含 `token` / `accessToken` / `access_token` / `ACCESS-TOKEN` / `refreshToken` / `password` / `passphrase` / `secret` / `clientSecret` / `apiKey` / `API-KEY` / `accessKey` / `access_code` / `authorization` / `cookie` / `Set-Cookie` / `csrfToken` / `jwt` / `bearer` / `credential` / `actToken` / 中文 `访问码`·`令牌`·`口令`·`密钥` 等；每个键在**顶层 / 嵌套对象 / 数组元素里的对象 / 三层深**四个位置各测一次，断言键被删、同层字段保留、输出里搜不到该键的值。
2. **表二：普通键（42 个）**：业务键（`name`/`status`/`at`/`agents`/`tasks`/`title`/`costCents` 等 32 个）断言保留；含 `token` 字样的统计键（`inputTokens`/`outputTokens`/`cachedInputTokens`/`maxTokens`/`promptTokens`/`totalTokens`/`tokenCount`）与含敏感子串的普通词（`tokenizer`/`secretary`/`authorizationless`/`credentialHint`）按当前行为断言**被删**。
3. **表三：敏感变体（23 个）**：`to-ken`、`tok3n`、大写 `TOKEN`、零宽字符 `tok\u200ben`、`pass_word`、`passwd`、`pwd`、`pwdHash`、`private_key`、`privateKey`、`privateKeyPath`、`signingKey`、`sessionId`、`sessionKey`、`session_secret_value`、`x-api-key`、`proxy-authorization`、`otp`、`otpCode`、`pin`、`pinCode`、`seed`、`mnemonic`，逐项断言删/留。

其它性质：凭据键 getter 不被读取（用会 `assert.fail` 的 getter 验证）、普通键 getter 会被读取（当前行为）；深度冻结入参调用不抛错且入参不变；数组顺序与 `null`/数字/布尔值原样保留；非对象入参原样返回；循环引用抛 `RangeError`、1000 层可处理、5000 层抛 `RangeError`；混合快照输出递归搜不到已登记凭据键名。

## 验证证据

仅新测试：

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/state-credential-redaction-matrix.test.mjs
```

```
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 49.186625
```

卡片验收命令（新 + 既有）：

```
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/state-credential-redaction-matrix.test.mjs tests/state-last-good.test.mjs
```

```
# Subtest: tests/state-last-good.test.mjs
not ok 2 - tests/state-last-good.test.mjs
  error: ENOENT … office3d-backup-h2/server.mjs
# tests 9
# pass 8
# fail 1
```

说明：既有 `tests/state-last-good.test.mjs` 在干净副本里**加载即失败**，原因是快照排除了 `office3d-backup-h2/` 备份目录（`ENOENT`），与本卡新增测试无关，也未去修它（卡片要求如实报告）。新增测试 8/8 全绿。

## 变异自检（6 种，每种都有「副本确实被改动」的证明）

做法：把 `state-last-good.mjs` 复制到系统临时目录；先对**未改动副本**跑一次矩阵（基线必须通过），记录副本 SHA-256；施加变异后再记录 SHA-256 与 `diff -u` 行数，确认副本确实变化后再跑矩阵；结束删除副本。原文件 SHA-256 全程保持不变（`abea2db8…`，结束后复核一致）。

| 变异 | 未改动副本基线 | 副本改动证明 | 变异后 | 变红的测试 |
|---|---|---|---|---|
| 正则去掉 `token` | exit 0 | sha `abea2db8…` → `abc73d991e04…`，diff 10 行 | exit 1 | 表一、表二 |
| 正则去掉 `password` | exit 0 | sha → `1640731cded6…`，diff 10 行 | exit 1 | 表一、getter 用例 |
| 正则去掉 `cookie` | exit 0 | sha → `3433533af73a…`，diff 10 行 | exit 1 | 表一 |
| `Object.keys` 递归改成只出顶层值 | exit 0 | sha → `85da78f7e04a…`，diff 11 行 | exit 1 | 表一、getter 用例 |
| 数组分支不再递归 | exit 0 | sha → `43b633eba7b4…`，diff 11 行 | exit 1 | 表一、getter 用例 |
| 去掉 `filter`（不删任何键） | exit 0 | sha → `5f6e927559d9…`，diff 11 行 | exit 1 | 表一、表二 |

每种变异的实际输出摘要：

```
=== regex-token        | baseline_exit=0 | copy_changed=YES | diff_lines=10 | mutated_exit=1
=== regex-password     | baseline_exit=0 | copy_changed=YES | diff_lines=10 | mutated_exit=1
=== regex-cookie       | baseline_exit=0 | copy_changed=YES | diff_lines=10 | mutated_exit=1
=== object-no-recursion| baseline_exit=0 | copy_changed=YES | diff_lines=11 | mutated_exit=1
=== array-no-recursion | baseline_exit=0 | copy_changed=YES | diff_lines=11 | mutated_exit=1
=== no-filter          | baseline_exit=0 | copy_changed=YES | diff_lines=11 | mutated_exit=1
```

副本删除后 `git diff --stat office3d/state-last-good.mjs` 为空。

## 报告清单 A：当前**不会**被删的敏感变体（19 个，按当前正则判定）

| 变体 | 现状 | 风险 |
|---|---|---|
| `passwd` | 保留 | 常见密码字段名，卡里原本列为「必须删」，实际未删 |
| `pwd` | 保留 | 同上 |
| `private_key` / `privateKey` / `privateKeyPath` | 保留 | 私钥字段，最高风险 |
| `signingKey` / `sessionKey` | 保留 | 签名/会话密钥 |
| `sessionId` | 保留 | 会话标识（可用于冒用） |
| `otp` / `otpCode` / `pin` / `pinCode` | 保留 | 一次性验证码 / 支付密码 |
| `seed` / `mnemonic` | 保留 | 助记词 / 种子（钱包场景） |
| `to-ken` / `tok3n` / `tok\u200ben`（零宽字符） | 保留 | 变形 token，正则无边界/归一化 |
| `pass_word` / `pwdHash` | 保留 | 下划线/哈希变体未覆盖 |

## 报告清单 B：被**误伤**的统计键与普通词（11 个）

| 键 | 后果 |
|---|---|
| `inputTokens` / `outputTokens` / `cachedInputTokens` | 成本/用量面板缺字段，费用统计不完整 |
| `maxTokens` / `promptTokens` / `totalTokens` / `tokenCount` | 模型限额与用量指标丢失 |
| `tokenizer` | 普通配置字段被删 |
| `secretary` | 普通业务字段（如联系人角色）被删 |
| `authorizationless` / `credentialHint` | 普通文案/提示字段被删 |

根因：`credential` 正则对所有键名做**无边界子串匹配**（`token`、`secret`、`credential` 等），没有白名单/例外。

## 没做到

- 未开 PR / 未转 Ready：本机无 `gh` 与 GitHub token，只有 SSH 推送权限。分支已推送：`ds/DS-5-state-credential-redaction-matrix`，目标 `office3d/rev-20261022`。
- 未推 `main`、未 force、未合并。
- 未修复任何漏网/误伤（按卡要求只报告，等验收后另立卡）。

## 未验证

- 董事会本机独立验收（按协议，自报「通过」不算）。
- 未接真实 `/state` 快照与真实 Paperclip 数据（矩阵值全部为 `fixture-*` 假值）。
- 既有 `tests/state-last-good.test.mjs` 在干净副本里因缺少 `office3d-backup-h2/` 无法运行，未验证其 5 个用例；本卡未修复该缺失。
- 未覆盖 symbol 键、`Date`/`Map` 等非纯对象值的行为——已观察到但只作为范围外发现记录，未写断言。

## 范围外发现（只报告，未修复）

1. **`passwd` 与卡里的预期不符**：卡把 `passwd` 列在「必须删除」，实际正则只匹配 `password`，`passwd` 保留（已进漏网清单）。
2. **无边界子串匹配导致误伤**：`tokenizer`、`secretary`、`authorizationless`、`credentialHint` 被删；统计键 `inputTokens` 等 7 个被删。
3. **`.` 通配过宽**：`api.?key` / `access.?(code|key)` 会删 `apiXkey`、`accessZcode`、`api key`、`access code` 等任意分隔符变体；这是双刃剑（能覆盖 `_`/`-`/空格，也会误删）。
4. **非纯对象值会丢失**：`Date` 经脱敏变成 `{}`；symbol 键被 `Object.fromEntries` 整体丢弃（非凭据 symbol 数据也一起丢）；类实例只保留自有可枚举属性。
5. **循环引用/超深嵌套**：循环引用与 5000 层嵌套抛 `RangeError`（1000 层正常）；快照若被构造出环，脱敏阶段会直接失败而不是保守拒绝。
6. `stripStateCredentials` 不处理原型链上的继承字段（`Object.keys` 只取自有可枚举），行为与 JSON 序列化口径一致，仅记录。

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/tests/state-credential-redaction-matrix.test.mjs` | 新增，210 行 |
| `dispatch/deepseek/outbox/DS-5-report.md` | 新增（本报告） |

`office3d/state-last-good.mjs`、`server.mjs`、`app.js`、`ui.js`、`index.html` 均未改动。
