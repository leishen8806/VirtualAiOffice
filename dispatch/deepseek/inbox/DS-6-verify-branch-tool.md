---
id: DS-6
base: office3d/rev-20261022
branch: ds/DS-6-verify-branch-tool
scope:
  - office3d/tools/verify-branch.mjs
  - office3d/tools/verify-branch.md
  - office3d/tests/verify-branch.test.mjs
budget: 3h
---
# DS-6：可复用的「分支验收脚本」`tools/verify-branch.mjs`（只读验收工具 + 自身测试）

**目的：** 把规划者每次验收「只加测试」类分支的固定流程自动化，提速并消除人为误判（例如：变异替换其实没有生效，却被当成「测试没抓到」或「测试变红」）。脚本只读、本地运行、零依赖，Windows 与 macOS 都要能跑。

## 用法（要实现的命令行）
```
node tools/verify-branch.mjs --repo <仓库根目录> --base <基线 ref> --head <待验收 ref> --config <验收配置.json> [--json <输出文件>]
```
`--repo` 默认当前目录；`--head` 默认 `HEAD`。所有路径参数相对 `--repo` 解析。

**验收配置（JSON）示例：**
```json
{
  "allowedChanges": ["office3d/tests/foo-edge.test.mjs", "dispatch/deepseek/outbox/DS-9-report.md"],
  "protectedFiles": ["office3d/foo.mjs"],
  "tests": { "cwd": "office3d", "files": ["tests/foo-edge.test.mjs", "tests/foo.test.mjs"] },
  "module": { "path": "office3d/foo.mjs", "envVar": "FOO_MODULE", "companions": ["office3d/bar.mjs"] },
  "mutations": [
    { "name": "boundary", "find": "x >= limit", "replace": "x > limit" },
    { "name": "drop-filter", "find": ".filter(isOk)", "replace": "" }
  ],
  "scan": { "forbiddenApis": ["Math.random", "Date.now"], "extraTerms": [] }
}
```

## 要做的事（按顺序执行，每步写进结果）
1. **范围检查：** `git diff --name-status <base>...<head>`；任何不在 `allowedChanges` 里的新增 / 修改 / 删除都判失败并列出。
2. **受保护文件不变：** `protectedFiles` 里每个文件在 base 与 head 的内容**按换行符归一化后**（`\r\n` → `\n`）逐字节相等；只因换行符不同不算改动，但要在结果里注明。
3. **跑测试：** 用 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 <files>` 在 `tests.cwd` 下运行（读 head 的工作区内容；若 head 不是当前检出，先用 `git worktree add` 到**系统临时目录**，结束后 `git worktree remove` 清理）；解析输出里的 tests / pass / fail 数（兼容 `ℹ tests N` 与 `# tests N` 两种格式），fail > 0 判失败。
4. **变异自检（核心，必须防误判）：**
   - 把 `module.path` 与 `companions` 复制到一个**新的系统临时目录**，保持相对位置（使被测模块的相对 import 仍能解析），副本统一用 `.mjs` 扩展名；
   - 对每个变异：**按原样字符串查找 `find`，必须恰好出现 1 次**，否则标记 `NOT_APPLIED`（出现 0 次或多次都算），**不计入通过 / 失败**；替换后再比较替换前后内容的 SHA-256，**必须不同**，否则同样 `NOT_APPLIED`；**不得用正则、不得经过 shell 转义**；
   - 用 `envVar=<副本绝对路径>` 运行同一组测试；fail > 0 记为 `KILLED`（测试抓到了），fail == 0 记为 `SURVIVED`；
   - 每个变异单独一份副本，运行后删除；最终删除整个临时目录。
   - 汇总：`killed / survived / notApplied`；任一 `SURVIVED` 判失败；`notApplied` 只警告，但结果里必须逐个列出原因（0 次 / 多次 / 内容无变化）。
5. **敏感信息与禁用 API 扫描**（只扫 `allowedChanges` 里实际变更的文件）：私钥头、`sk-` / `ghp_` / `github_pat_` / `AKIA` / `xox?-` 形式的令牌、`Bearer <长串>`、`password|secret|api_key|access_token` 形如赋值的长字符串、IPv4 地址、Windows 盘符路径（如 `C:\`）、`/Users/` 路径、`forbiddenApis`、`extraTerms`。命中即判失败，结果里只给**文件名 + 行号 + 规则名**，**不得输出命中的原文**。
6. **输出：** 人类可读的摘要（每步 PASS / FAIL / WARN + 关键数字）打印到标准输出；`--json` 时写结构化结果。**退出码：** 0 全过；1 范围或受保护文件失败；2 测试失败；3 存在 SURVIVED 变异；4 扫描命中；5 参数 / git 错误。
7. **安全约束（写进脚本与文档）：** 只读——不 commit、不 push、不 checkout 当前工作区、不改任何已跟踪文件；只在系统临时目录写文件并在结束时清理（异常退出也要清理，用 `try/finally`）；不联网；不读取 `.env*`、`*.pem`、`*.key` 等文件内容；不打印环境变量。
8. **文档 `tools/verify-branch.md`：** 用法、配置字段说明、退出码、Windows 与 macOS 的示例命令、一份**真实可用的示例配置**（以本仓库已有的 `tests/pngmini.test.mjs` 与 `pngmini.mjs` 为例：两三条有效变异 + 一条故意写错使其 `NOT_APPLIED` 的变异）。

## 自身测试 `tests/verify-branch.test.mjs`
在**系统临时目录里用 `git init` 建一个最小仓库夹具**（一个被测模块 + 一个测试 + 两个提交），覆盖：
- 越界改动被判失败（退出码 1）；受保护文件只改换行符时判通过并注明；
- 测试失败时退出码 2；
- 变异：有效变异被 `KILLED`；一条测试抓不到的变异得到 `SURVIVED` 与退出码 3；`find` 出现 0 次 / 2 次 / 替换后内容不变 三种都得到 `NOT_APPLIED` 且不影响通过判断；
- 扫描：在夹具里放一个假的 `ghp_` 令牌和一个 IPv4，得到退出码 4，且输出里**不含**命中原文；
- 临时目录与 worktree 在成功与异常两种情况下都被清理；
- 不依赖网络、不依赖本仓库以外的文件；单个测试文件运行 < 60 秒。

## 验收标准
```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/verify-branch.test.mjs
node tools/verify-branch.mjs --repo .. --base office3d/rev-20261022 --head HEAD --config <你写在文档里的 pngmini 示例配置>
```
- 自身测试全过；对 pngmini 示例的真实运行结果（摘要全文）贴进报告：有效变异全部 `KILLED`、故意写错的那条为 `NOT_APPLIED`。
- 只新增 `scope` 里的三个文件。

## 不做的事
不安装依赖、不联网；不碰 `app.js / ui.js / index.html / server.mjs`；不推 `main`、不 force；报告里不得出现任何密钥、IP、本机路径或账号。

## 交付
- 分支 `ds/DS-6-verify-branch-tool`，推送后把分支名告诉派发人。
- 同一分支新增 `dispatch/deepseek/outbox/DS-6-report.md`：做到 / 没做到 / 未验证；改动文件与行数；两条验收命令的真实输出；已知限制。
- 完成后停下，等待规划者验收。
