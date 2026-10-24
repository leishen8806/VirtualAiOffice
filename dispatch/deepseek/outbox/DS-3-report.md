# DS-3 汇报：`office3d/done-rules.mjs` 原因码可达 + 单调性 + 纯度矩阵测试

- 状态：**待验收**
- 分支：`ds/DS-3-done-rules-matrix-tests`
- 基线：`office3d/rev-20261022` @ `47efb7e3b565eaba7d45c61cdf206145599e69bd`
- PR：**未开**（本机没有 `gh` / GitHub token；按卡片「把分支名告诉派发人」交付）
- 卡片：`dispatch/deepseek/inbox/DS-3-done-rules-matrix-tests.md`

## 做到

新增 `office3d/tests/done-rules-matrix.test.mjs`（323 行，16 个 test，65 处 `assert` 调用点；执行时循环/子集断言 > 2000 个点），只加测试、不改被测代码。

覆盖卡片五个方面：

1. **原因码可达性**：13 个原因码逐个分类——7 个可达码各有最小输入并断言产出；6 个不可达码用显式「已知不可达」断言固定（见下节清单）。
2. **单调性**：依次追加 execution → test → review（独立）→ acceptance → merge → release，等级严格按 `LEVELS` 逐级升高；对全部 64 个证据子集逐条追加证据，等级只保持或升高。
3. **版本不一致一律不计入**：`sameVersion` 对称；`git:` 与 `sha256:` 互不相等；大小写与反斜杠规范化后相等；7 位/40 位 commit 前缀互认；不可解析字符串 / `null` / 已解析的 `unparseable` 对象与任何值（含自身）都不相等；过期 execution / test 证据不推进等级。
4. **纯度与确定性**：深度冻结任务、证据、policy 后调用不抛错；重复调用结果逐字段相等；有效证据顺序反转 / 轮转后等级与 levels 相同；输出递归检查无 `undefined` / `NaN`。
5. **输入清洗**：`null` / `undefined` / 数字 / 字符串 / 未知 kind 证据、控制字符、600 字符 ref、600 字符版本、`null` 当前版本都不抛错；invalid / stale 的 ref ≤ 160、版本 raw ≤ 500，输出无 undefined/NaN。
6. 额外覆盖等级门槛的 `>=` 边界（`level === requiredLevel` 必须 `done`）与失败证据不推进等级（供变异自检定位）。

与既有 `tests/done-rules.test.mjs`（7 个例子）不重复：那边覆盖版本解析、连续升级、失败/过期/保护测试证据、board/stale 判定、legacy 三态、10 万条性能与静态纯度；本卡补的是**全码矩阵、子集单调性、边界与清洗**。

## 验证证据

验收命令（与卡片一致）：

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/done-rules-matrix.test.mjs tests/done-rules.test.mjs
```

真实输出末尾：

```
# tests 23
# suites 0
# pass 23
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 90.118959
```

单次运行约 0.12 s（远低于 10 s 上限）。

## 变异自检（6 种，全部在系统临时目录的 `.mjs` 副本上做）

做法：复制 `done-rules.mjs` 到临时目录并施加变异，`DONE_RULES_MODULE=<副本>` 运行 `tests/done-rules-matrix.test.mjs`；完成后删除副本。

| 变异 | 结果 | 变红的测试 |
|---|---|---|
| 等级门槛 `>=` 改成 `>` | exit=1，15 pass / 1 fail | `requiredLevel 边界包含等号…` |
| 删掉 `REASON_CODES` 里的 `NO_TEST` | exit=1，15 pass / 1 fail | `LEVELS / EVIDENCE_KINDS / REASON_CODES…完整且冻结` |
| `cleanVersionPart` 去掉 `.toLowerCase()` | exit=1，15 pass / 1 fail | `sameVersion 对称，git 与 sha256…` |
| `ok !== true` 的失败证据不再拦截 | exit=1，14 pass / 2 fail | `7 个可达原因码…`、`失败证据不会推进等级` |
| 文本清洗去掉 `.slice(0, max)` | exit=1，15 pass / 1 fail | `控制字符、超长文本、异常证据…清洗` |
| `completionLevel` 原地 `list.reverse()` | exit=1，15 pass / 1 fail | `深度冻结入参可调用，重复调用结果逐字段相等` |

每种变红的摘要：

```
=== level-gate      exit=1  # tests 16 # pass 15 # fail 1
=== delete-code     exit=1  # tests 16 # pass 15 # fail 1
=== version-case    exit=1  # tests 16 # pass 15 # fail 1
=== failed-evidence exit=1  # tests 16 # pass 14 # fail 2
=== text-slice      exit=1  # tests 16 # pass 15 # fail 1
=== input-mutation  exit=1  # tests 16 # pass 15 # fail 1
```

副本删除后 `git diff --stat office3d/done-rules.mjs` 为空；再跑验收命令恢复 23/23 通过。

## 「已知不可达」原因码清单（6 个）

`REASON_CODES` 共 13 个，其中以下 6 个在当前源码里**只登记、没有任何代码路径会产出**，测试用显式断言固定：

| 原因码 | 当前为何不可达 |
|---|---|
| `NO_TEST` | `evaluateDone` 只在等级为 `none` 时推 `NO_EXECUTION`；缺 test 只体现在 `missing: ['verified']`，不会推码 |
| `NO_REVIEW` | 同上，缺 review 体现在 `missing: ['reviewed']` |
| `REVIEW_NOT_INDEPENDENT` | 非独立 review 只是让 `reviewed` 不置位，不产生原因码 |
| `NO_ACCEPTANCE` | 缺 acceptance 体现在 `missing: ['accepted']` |
| `NO_MERGE` | 缺 merge 体现在 `missing: ['merged']` |
| `NO_RELEASE` | 缺 release 体现在 `missing: ['released']` |

可达的 7 个码：`LEGACY_BASELINE`、`NO_EXECUTION`、`VERSION_MISMATCH`、`EVIDENCE_FAILED`、`PROTECTED_TEST_MISMATCH`、`ACCEPTANCE_STALE`、`BOARD_ACCEPTANCE_REQUIRED`，每个都有最小输入与断言。

## 没做到

- 未开 PR / 未转 Ready：本机无 `gh` 与 GitHub token，只有 SSH 推送权限。分支已推送：`ds/DS-3-done-rules-matrix-tests`，目标 `office3d/rev-20261022`。
- 未推 `main`、未 force、未合并。

## 未验证

- 董事会本机独立验收（按协议，自报「通过」不算）。
- 未接真实 Paperclip 证据数据（按卡片使用构造输入）。
- 未覆盖 `evaluateDone` 的 policy 为 `null` 的输入（见范围外发现；卡片只要求证据/版本为 null）。
- 未验证 10 万条以上证据的性能（既有测试已覆盖，本卡未重复）。

## 范围外发现（只报告，未修复）

1. **`sameVersion` 对非字符串入参误判相等**：`sameVersion(42, 42) === true`、`sameVersion(42, 43) === true`、`sameVersion({}, {}) === true`、`sameVersion({}, { a: 1 }) === true`。原因是它只对字符串做 `parseVersion`，其余值直接比较 `path`/`hash` 两个 `undefined`。按卡片「按当前行为固定」，测试已把这一行为显式断言；建议在入口加 `typeof === 'object'` / `kind === 'unparseable'` 守卫。
2. **6 个原因码登记但不可达**：`REASON_CODES` 对外承诺了 `NO_TEST` / `NO_REVIEW` / `REVIEW_NOT_INDEPENDENT` / `NO_ACCEPTANCE` / `NO_MERGE` / `NO_RELEASE`，实际只用 `missing` 的等级名表达；调用方若按原因码分支会永远等不到这些码。建议要么补产出路径，要么从枚举移除并在文档说明用 `missing`。
3. **`policy` 传 `null` 会抛 `TypeError`**：`evaluateDone(task, evidence, current, null)` 在读取 `policy.legacyDone` 处抛错；`completionLevel(evidence, current, null)` 在读取 `policy.protectedTestsHash` 处抛错。默认参数只对 `undefined` 生效，调用方传 `null` 时没有兜底。
4. `enforcementBoundary()` 的 `uncoveredPaths` 是固定文案，不随 `coveredPaths` 变化；属于产品文案而非缺陷，仅记录。

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/tests/done-rules-matrix.test.mjs` | 新增，323 行 |
| `dispatch/deepseek/outbox/DS-3-report.md` | 新增（本报告） |

`office3d/done-rules.mjs`、`server.mjs`、`app.js`、`ui.js`、`index.html` 均未改动。
