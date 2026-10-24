---
id: DS-3
base: office3d/rev-20261022
branch: ds/DS-3-done-rules-matrix-tests
scope:
  - office3d/tests/done-rules-matrix.test.mjs
budget: 2h
---
# DS-3：为 `office3d/done-rules.mjs` 补「原因码可达 + 单调性 + 纯度」矩阵测试（只加测试，不改被测代码）

`done-rules.mjs` 是纯模块（无 import），导出 `LEVELS`、`EVIDENCE_KINDS`、`REASON_CODES`（13 个）、`parseVersion`、`sameVersion`、`completionLevel(evidence, currentVersion, policy)`、`evaluateDone(task, evidence, currentVersion, policy)`、`enforcementBoundary`。已有 `tests/done-rules.test.mjs`（7 个用例），**先完整读它与被测源码**，不要重复已有断言；本卡补的是它没有系统覆盖的三个方面。

## 要做的事
1. 新建 `office3d/tests/done-rules-matrix.test.mjs`（`node:test` + `node:assert/strict`，风格参考同目录其它测试；只用普通值断言）。
2. 覆盖（至少 25 个断言点）：
   - **原因码可达性：** 对 `REASON_CODES` 里的**每一个**码，构造一组最小输入使 `evaluateDone`（或 `completionLevel`）确实产出该码并断言之；个别码按当前源码无法产出的，不要硬凑，在测试里用显式的「已知不可达」断言固定下来并写进报告。
   - **单调性：** 在同一任务与同一版本下，**追加**合法证据只能让 `completionLevel` 保持或升高，永远不降；依次追加 execution → test → review（独立）→ acceptance → merge → release 时，等级按 `LEVELS` 顺序逐级升高。
   - **版本不一致一律不计入：** `sameVersion` 对称；`git:` 与 `sha256:` 互不相等；大小写与反斜杠规范化后相等的算相等；不可解析的值与任何值（包括它自己）都不「相同」（按当前行为，用断言固定）。
   - **纯度与确定性：** 调用不修改入参（对入参做深度冻结后再调用，不得抛错）；同一输入重复调用结果逐字段相等；证据顺序打乱后结果相同。
   - **输入清洗：** 含控制字符、超长（>500 字符）、`null` / `undefined` / 非对象的证据与版本不抛错，输出不含 `undefined` / `NaN`。
3. 只新增 `scope` 里的一个文件，**不改 `done-rules.mjs` 或任何其它文件**。发现的被测代码问题（例如某个码按设计应可达但不可达）**只写进报告的「范围外发现」，不修**。

## 验收标准（在干净的仓库副本里运行）
```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/done-rules-matrix.test.mjs tests/done-rules.test.mjs
```
- 全部通过（含原有 `done-rules.test.mjs`）。
- 变异自检（在系统临时目录的 `.mjs` 副本上做，让测试通过环境变量 `DONE_RULES_MODULE` 指向副本——测试里要支持这个变量，默认读 `../done-rules.mjs`）：至少 6 种，例如：把某个等级判断的 `>=` 改成 `>`、删掉 `REASON_CODES` 里的一个码、让 `sameVersion` 不规范化大小写、让 `completionLevel` 在失败证据上不降级、删掉文本清洗里的 `slice`、让入参被原地修改。每种都必须让对应测试变红；然后删副本，`git diff` 里 `done-rules.mjs` 无改动。报告里贴每种变异的变红摘要。

## 不做的事
不安装依赖、不联网、不下载素材；不碰 `app.js / ui.js / index.html / server.mjs`；不推 `main`、不 force；不在报告里写任何密钥、IP、本机路径或账号。

## 交付
- 分支 `ds/DS-3-done-rules-matrix-tests`，推送后把分支名告诉派发人（或开 PR，目标 `office3d/rev-20261022`）。
- 同一分支新增 `dispatch/deepseek/outbox/DS-3-report.md`：做到 / 没做到 / 未验证；改动文件与行数；测试命令与输出末尾；每种变异的结果；「已知不可达」原因码清单；范围外发现。
- 完成后停下，等待规划者验收。
