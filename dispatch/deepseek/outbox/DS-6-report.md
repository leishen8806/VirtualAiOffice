# DS-6 汇报：分支验收工具 `tools/verify-branch.mjs`

- 状态：**待验收**
- 分支：`ds/DS-6-verify-branch-tool`
- 基线：`office3d/rev-20261022` @ `47efb7e3b565eaba7d45c61cdf206145599e69bd`
- PR：**未开**（本机没有 `gh` / GitHub token；按卡片把分支名交给派发人）
- 卡片：`dispatch/deepseek/inbox/DS-6-verify-branch-tool.md`

## 做到

新增三个文件（只新增，不改任何已有文件）：

| 文件 | 行数 | 内容 |
|---|---|---|
| `office3d/tools/verify-branch.mjs` | 509 | 只读验收工具 |
| `office3d/tools/verify-branch.md` | 128 | 用法、配置字段、退出码、跨平台示例、真实 pngmini 示例配置 |
| `office3d/tests/verify-branch.test.mjs` | 271 | 自身测试（12 个 test，临时 `git init` 夹具） |

工具按卡片顺序执行五步：

1. **范围检查**：`git diff --name-status <base>...<head>`，任何不在 `allowedChanges` 的新增 / 修改 / 删除判失败（重命名按旧、新两个路径检查）；支持 `base`/`head` 只有远端 ref 时自动回退 `origin/<ref>`。
2. **受保护文件**：`protectedFiles` 按 `\r\n → \n` 归一化后比较；仅换行差异通过并给出 `WARN 仅换行符不同`。
3. **跑测试**：固定 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 <files>`；head 不是当前检出时用系统临时目录的 `git worktree add --detach`，结束后 `worktree remove --force` + 删临时目录；兼容 `ℹ tests N` 与 `# tests N` 两种摘要格式；无法解析摘要按测试失败处理。
4. **变异自检（防误判）**：
   - `find` 按原样字符串统计，必须恰好 1 次；0 次 / 多次 → `NOT_APPLIED`；
   - 替换前后比较 SHA-256，相同 → `NOT_APPLIED`；
   - 用 `module.envVar=<副本绝对路径>` 跑同一组测试，`fail>0` = `KILLED`、`fail==0` = `SURVIVED`；
   - 变异副本每例一份、跑完即删；任一 `SURVIVED` 判失败（退出码 3）；`NOT_APPLIED` 只警告但逐个列出原因。
   - 额外支持 `module.mirrorTests`（可选扩展）：连 `tests.cwd/tests` 一起镜像，供「测试用相对 import 而不是 envVar」的模块（pngmini 就是这种）也能真正跑变异。
5. **敏感信息 / 禁用 API 扫描**：只扫实际变更文件；私钥头、`sk-` / `ghp_` / `github_pat_` / `AKIA` / Slack `xox?-`、`Bearer <长串>`、password/secret/api_key/access_token 长赋值、IPv4、Windows 盘符、macOS 用户目录、`forbiddenApis`、`extraTerms`；输出只给**文件名 + 行号 + 规则名**，不回显原文。

安全约束：不 commit / push / checkout / 改已跟踪文件；只在系统临时目录写并在 `finally` 清理（异常退出也清理）；不联网；不读取 `.env*` / `*.pem` / `*.key`；不打印环境变量。退出码 0/1/2/3/4/5 与卡片一致。

## 两条验收命令的真实输出

### 1）自身测试

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/verify-branch.test.mjs
```

```
# tests 12
# suites 0
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6200.344791
```

覆盖：越界改动退出码 1；受保护文件仅换行差异通过并 WARN；测试失败退出码 2；有效变异 `KILLED`；测试抓不到的变异 `SURVIVED` 且退出码 3；`find` 0 次 / 2 次 / 替换后不变三种 `NOT_APPLIED` 且不影响通过；**夹具固定 `core.autocrlf=false`，并回归验证 `autocrlf=true` 会抹掉只改换行符的提交**；**仓库本地 `autocrlf=true`、worktree 检出 CRLF 时仍能完成验收**；扫描命中退出码 4 且输出不含令牌/IP 原文；成功与异常路径都清理临时目录与 worktree；参数/配置/git 错误退出码 5；`--json` 结构。

### 2）pngmini 示例配置（真实运行，提交本工具三件套后）

```
cd office3d
node tools/verify-branch.mjs --repo .. --base office3d/rev-20261022 --head HEAD --config <文档里的 pngmini 示例配置>
```

```
[1/5] 范围检查 PASS（3 个变更文件）
[2/5] 受保护文件 PASS（1 个）
[3/5] 测试 PASS（11/11）
      PASS paeth-tie: KILLED
      PASS average-shift: KILLED
      PASS palette-index: KILLED
      WARN intentional-not-applied: NOT_APPLIED（find 出现 0 次（必须恰好 1 次））
[4/5] 变异自检 PASS（killed=3 notApplied=1）
[5/5] 扫描 PASS
RESULT PASS exit=0
```

（本报告提交后再跑，范围检查会变成 PASS（4 个变更文件），其余不变。）

## Windows 兼容性（2026-10-23 修复）

**问题（规划者在 Windows 复现）**：Git for Windows 默认 `core.autocrlf=true`。测试夹具里 `head-newline` 分支只把文件换成 CRLF，`git add` 时被自动规范化回 LF，暂存区没有差异，`git commit -q -m head-newline` 以「nothing to commit」退出 1，导致 `tests/verify-branch.test.mjs` 10 个用例全部失败。本机把夹具 `core.autocrlf` 设为 `true` 可稳定复现同一现象（macOS 上同样复现，不是 Windows 特有逻辑）。

**修了什么（只改 DS-6 的三个文件）**：

1. **夹具仓库建好后立即固定换行配置**：`tests/verify-branch.test.mjs` 的 `makeFixture()` 在 `git init -q` 之后立刻执行 `git config core.autocrlf false` 与 `git config core.safecrlf false`，让「只改换行符」的 head-newline 提交真实落盘；并新增回归测试断言这两项配置为 `false`，同时用对照仓库证明 `autocrlf=true` 时同样的 CRLF 改动不会产生暂存差异（把机制钉死）。
2. **工具比较受保护文件改为读原始字节**：`tools/verify-branch.mjs` 不再用 `git show` 的 UTF-8 字符串比较，改为 `spawnSync` 不带 `encoding` 取 **git 对象库原始 Buffer**，用 `Buffer.equals` 逐字节比较；只有「CRLF 归一化后相等」才判 `WARN 仅换行符不同`。这一步不经过工作区，因此不受 `core.autocrlf` / `.gitattributes` 的检出转换影响。
3. **变异副本改为从 `head` 的 git blob 读源码**：原先复制被测模块读的是工作区文件，Windows 上检出会被换成 CRLF，导致 `find` 的换行不匹配、变异全部 `NOT_APPLIED`。现在 `readBlobText(repo, head, path)` 用 `git show <head>:<path>` 取提交里的原始内容（取不到才回退工作区），镜像 / 非镜像两种变异模式都改用它；worktree 只用来跑测试。

**验证**：

- 本机 12/12 通过，其中新增两条回归：① `autocrlf=true` 会抹掉换行提交、`false` 才能提交；② 仓库本地 `autocrlf=true`、`head` 不是当前检出（worktree 检出为 CRLF）时，验收仍得到 `boundary: KILLED`、退出码 0。
- 临时把本仓库 `git config core.autocrlf true` 后跑 pngmini 示例验收：`范围检查 PASS / 受保护文件 PASS / 测试 PASS（11/11） / 变异自检 PASS（killed=3 notApplied=1） / 扫描 PASS`，退出码 0；跑完已 `git config --unset core.autocrlf` 恢复。
- 说明：以上是在 macOS 上用 `autocrlf=true` **模拟** Windows 行为；真实 Git for Windows 环境仍请规划者复跑确认（见「未验证」）。

## 已知限制

1. **pngmini 示例需要 `mirrorTests`**：基线里的 `tests/pngmini.test.mjs` 用相对 `import` 而不是 `envVar` 读取模块，严格按 envVar 契约跑变异会全部 `SURVIVED`。因此工具增加了可选字段 `module.mirrorTests`，文档示例打开它并把 `tests` 目录镜像到临时目录；默认仍是 envVar 契约。
2. **示例配置的 `allowedChanges` 含有本工具自身文件**：基线分支已包含 pngmini 的合并，在 DS-6 分支直接验收时会看到本工具三件套；示例把这三项列入允许清单以便本分支演示，文档已注明「验收其它分支时替换为该分支实际变更清单」。
3. **companion 扩展名统一改成 `.mjs`**：按卡片要求副本统一 `.mjs`；若被测模块用 `.js` 相对 import companion，改名后相对 import 会断，属于已知边界。
4. **扫描是行级正则**：只覆盖卡片列出的模式；IPv4 规则可能对版本号样式的四段数字产生误报（命中只报规则名，不回显原文）。
5. **真实 Windows 上的最终复跑未做**：本轮已按 Windows 反馈修夹具 `autocrlf/safecrlf`、受保护文件原始字节比较、变异源读 git blob，并在 macOS 上用 `autocrlf=true` 模拟验证；实际 Git for Windows 环境仍请规划者复跑确认。
6. **未对真实大型分支做性能验收**：自身测试用最小夹具；pngmini 示例 4 条变异约 3 秒。100+ 文件的变异集未测。

## 没做到

- 未开 PR / 未转 Ready：本机无 `gh` 与 GitHub token。分支已推送：`ds/DS-6-verify-branch-tool`，目标 `office3d/rev-20261022`。
- 未推 `main`、未 force、未合并。
- 工具**没有**接入 CI 或 `package.json` scripts（卡片 scope 只允许三个文件）。

## 未验证

- 董事会本机独立验收（按协议，自报「通过」不算）。
- Windows 与 macOS 同时实跑（只在当前 macOS 环境验证；命令只用了 `node:path` / `spawnSync`，无 shell 拼接）。
- 与真实 `dispatch/deepseek` 工作流的端到端联调：本轮只用 pngmini 示例与临时夹具。
- 扫描规则对真实密钥样本的召回率（只用了构造的假令牌/IP 做命中测试）。
- `module.mirrorTests` 对依赖大量 fixtures 的测试目录未验证。

## 范围外发现（只报告，未修复）

1. 基线中被验收的测试如果不支持 `module.envVar`，变异自检会全部 `SURVIVED`；这不是工具缺陷，但会让「只加测试」分支的变异验收失效。建议后续卡片把「测试必须支持 `<MODULE>_MODULE` 环境变量」写进验收标准。
2. 基线 `office3d/rev-20261022` 在 DS-1 合并之后，再对 pngmini 跑卡片的字面验收命令（`--base rev --head HEAD`）必然把待验收分支自身文件算进 diff；卡片里的示例命令需要配合分支变更清单使用（文档已注明）。
3. `worktree` 清理依赖 `git worktree remove --force`；若宿主机 git 版本过旧（<2.17）不支持 `--detach`，需要另做兼容（当前要求未写明最低 git 版本）。

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/tools/verify-branch.mjs` | 新增，509 行 |
| `office3d/tools/verify-branch.md` | 新增，128 行 |
| `office3d/tests/verify-branch.test.mjs` | 新增，271 行 |
| `dispatch/deepseek/outbox/DS-6-report.md` | 新增（本报告） |

`app.js`、`ui.js`、`index.html`、`server.mjs` 及其它已跟踪文件均未改动。
