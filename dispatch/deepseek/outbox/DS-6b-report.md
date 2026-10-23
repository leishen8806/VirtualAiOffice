# DS-6b 汇报：verify-branch 扫描支持「测试夹具假值」白名单

- 状态：**待验收**
- 分支：`ds/DS-6b-verify-fixture-allowlist`
- 基线：`office3d/rev-20261023-2` @ `cbddb9f`
- 卡片：`dispatch/deepseek/inbox/DS-6b-verify-branch-fixture-allowlist.md`

## 做到

只改 `scope` 里的三个文件：

| 文件 | 变更 |
|---|---|
| `office3d/tools/verify-branch.mjs` | +30 / −2 行（537 行） |
| `office3d/tools/verify-branch.md` | +17 行（145 行） |
| `office3d/tests/verify-branch.test.mjs` | +51 行（322 行，16 个 test） |

1. **配置新增 `scan.allowValuePattern`**：字符串正则，默认 `^fixture-[A-Za-z0-9_-]+$`；配置里给了非法正则时报 `scan.allowValuePattern 不是合法正则` 并以退出码 5 结束。
2. **命中的赋值右侧整体匹配才降级**：`credential_assignment` 规则改为捕获赋值右侧字符串（`password|secret|api_key|access_token … = "…"`），只有该字符串**整体**匹配 `allowValuePattern` 时记为 `ALLOWED_FIXTURE`（计入 `allowedFixtures`，不判失败）。私钥头、`sk-`、`ghp_`、`github_pat_`、`AKIA`、Slack `xox?-`、`Bearer` 长串等规则**不在白名单适用范围**，永远直接命中。
3. **结果分开列出**：JSON 里 `steps.scan.hits` 与 `steps.scan.allowedFixtures` 分开；人类可读摘要打印「放行测试夹具假值 N 处（ALLOWED_FIXTURE，不判失败）」并逐条只给**文件名 + 行号 + 规则名**，不输出命中原文。
4. **文档**：配置字段表新增 `scan.allowValuePattern`；新增「测试夹具假值白名单」小节与 JSON 示例，写明令牌 / 私钥规则不受白名单影响。

## 自身测试（新增 4 条，共 16 条全过）

- 三个 `fixture-*` 假值（`password` / `secret` / `api_key`）→ 退出码 0，输出 3 处 `ALLOWED_FIXTURE`，且不回显假值原文；
- `fixture-ghp_<40 位>`：赋值被白名单放行，但 `github_ghp_token` 规则仍然命中 → 退出码 4，不回显令牌原文；
- 自定义 `allowValuePattern: "^FAKE_[A-Z0-9_]+$"` 生效（默认模式下同一文件退出码 4，自定义后退出码 0）；
- 非法正则 `"(["` → 退出码 5 且输出含 `allowValuePattern`。

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/verify-branch.test.mjs
```

```
# tests 16
# suites 0
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10310.813042
```

夹具仍固定 `core.autocrlf false` / `core.safecrlf false`（DS-6 的 Windows 修复保留），Windows 与 macOS 同一条命令。

## 没做到

- 未开 PR（本机无 `gh` / GitHub token）；分支已推送，目标 `office3d/rev-20261023-2`。
- 未推 `main`、未 force。

## 未验证

- 规划者本机独立验收（按协议，自报「通过」不算）。
- 未用 DS-5 分支做真实重验（该分支不在本快照；用例已用构造夹具覆盖同样形态）。

## 范围外发现

1. **本快照（`office3d/rev-20261023-2`）里没有 `office3d/tests/pngmini.test.mjs`**：DS-6 文档里的 pngmini 示例配置在本快照上无法真实运行（不是本卡改动导致，示例保留）；建议后续快照确认该文件是否应随包提供。

## 改动行数

`tools/verify-branch.mjs` +30 / −2；`tools/verify-branch.md` +17；`tests/verify-branch.test.mjs` +51；`dispatch/deepseek/outbox/DS-6b-report.md` 新增（本报告）。未改动其它文件。
