---
id: DS-6b
base: office3d/rev-20261023-2
branch: ds/DS-6b-verify-fixture-allowlist
scope:
  - office3d/tools/verify-branch.mjs
  - office3d/tools/verify-branch.md
  - office3d/tests/verify-branch.test.mjs
budget: 1h
---
# DS-6b：verify-branch 扫描支持「测试夹具假值」白名单（小改进）

**问题：** 用 `tools/verify-branch.mjs` 重验 DS-5 时，第 5 步扫描把测试文件里的明显假值（如 `'fixture-token'`、`'fixture-key'`）判为 `credential_assignment`，整体退出码 4。这些是脱敏测试必需的假数据，属于误报。

## 要做的事
1. 配置新增 `scan.allowValuePattern`（字符串形式的正则，默认 `^fixture-[A-Za-z0-9_-]+$`）：只有当**命中的赋值右侧字符串整体**匹配它时，才把该处命中降级为 `ALLOWED_FIXTURE`（计入结果但不判失败）；私钥头、`ghp_` / `github_pat_` / `sk-` / `AKIA` / `xox?-` / `Bearer` 长串**永远不能**被白名单放行。
2. 结果里分别列出 `hits` 与 `allowedFixtures`（仍只给文件名 + 行号 + 规则名，**不输出原文**）。
3. 自身测试新增：假值被放行；真实形态的 `ghp_` 令牌即使形如 `fixture-ghp_…` 也不被放行；自定义 `allowValuePattern` 生效；非法正则时退出码 5 并说明原因。
4. 文档补充该字段与示例。

## 验收
`cd office3d && node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/verify-branch.test.mjs` 全过（**Windows 与 macOS 都要能过**，夹具继续固定 `core.autocrlf false`）。只改 `scope` 里的三个文件；不联网、不装依赖；不推 `main`、不 force；报告不含任何密钥、IP、本机路径或账号。

## 交付
分支 `ds/DS-6b-verify-fixture-allowlist`，推送后告诉派发人；`dispatch/deepseek/outbox/DS-6b-report.md`：做到 / 没做到 / 未验证、改动行数、测试输出末尾。完成后直接做 DS-8。
