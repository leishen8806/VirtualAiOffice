# 分支验收工具 `tools/verify-branch.mjs`

只读、零依赖、Windows / macOS 通用的分支验收脚本。它把「只加测试」类分支的验收固定流程自动化：

```text
范围检查 → 受保护文件 → 跑测试 → 变异自检 → 敏感信息 / 禁用 API 扫描 → 摘要与退出码
```

**安全边界**：不 commit、不 push、不 checkout 当前工作区、不改任何已跟踪文件；只在系统临时目录写文件（`git worktree`、变异副本），无论成功或异常都在 `finally` 清理；不联网；不读取 `.env*` / `*.pem` / `*.key`；不打印环境变量。

## 用法

```bash
node tools/verify-branch.mjs --repo <仓库根目录> --base <基线 ref> --head <待验收 ref> --config <验收配置.json> [--json <输出文件>]
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--repo` | 当前目录 | 仓库根目录；其它路径参数相对它解析 |
| `--base` | 必填 | 基线 ref（`base...head` 三点 diff） |
| `--head` | `HEAD` | 待验收 ref |
| `--config` | 必填 | 验收配置 JSON（相对 `--repo`） |
| `--json` | 无 | 把结构化结果写到该文件 |

## 配置字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `allowedChanges` | 是 | 允许变更的仓库相对路径；任何其他增 / 改 / 删都判范围失败（重命名按旧、新两个路径检查） |
| `protectedFiles` | 否 | 必须保持不变的仓库相对路径；比较前把 `\r\n` 归一化为 `\n`，仅换行差异算通过并给出 WARN |
| `tests.cwd` | 是 | 跑测试的工作目录（相对 `--repo`） |
| `tests.files` | 是 | 传给 `node --test` 的测试文件（相对 `tests.cwd`） |
| `module.path` | 配置了 `mutations` 时必填 | 被测模块的仓库相对路径 |
| `module.envVar` | 同上 | 变异副本路径通过该环境变量传给测试 |
| `module.companions` | 否 | 被测模块的相对 import 依赖，复制时保持相对位置 |
| `module.mirrorTests` | 否 | `true` 时把 `tests.cwd/tests` 与测试文件一起镜像到临时目录，供「测试用相对 import 而不是 envVar」的模块使用（默认 `false`，严格按 envVar 契约） |
| `mutations[]` | 否 | 每条 `{ name, find, replace }`；`find` 必须**按原样字符串恰好出现 1 次** |
| `scan.forbiddenApis` | 否 | 额外禁用的 API 字面量（按字面量匹配，不经正则转义） |
| `scan.extraTerms` | 否 | 额外禁查的词条（按字面量匹配） |

### 变异语义（防误判）

- `find` 按**原样字符串**统计，必须恰好 1 次；0 次或多次都记 `NOT_APPLIED`，计入警告、不计入通过/失败。
- 替换前后必须比较 SHA-256，相同则记 `NOT_APPLIED`（例如 `find` 与 `replace` 等价）。
- 用 `module.envVar=<副本绝对路径>` 跑同一组测试：`fail > 0` = `KILLED`，`fail == 0` = `SURVIVED`。
- 任一 `SURVIVED` 判失败（退出码 3）；`NOT_APPLIED` 只警告，但摘要里逐个列出原因。
- 每个变异独立一份副本，跑完立即删除；最后删除整个临时目录。

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 全过 |
| 1 | 范围检查或受保护文件失败 |
| 2 | 测试失败（含测试无法运行 / 输出无法解析） |
| 3 | 存在 `SURVIVED` 变异 |
| 4 | 敏感信息或禁用 API 扫描命中 |
| 5 | 参数 / 配置 / git 错误 |

## 示例命令

macOS / Linux：

```bash
cd office3d
node tools/verify-branch.mjs --repo .. --base office3d/rev-20261022 --head HEAD --config verify.json --json /tmp/verify-result.json
```

Windows PowerShell：

```powershell
cd office3d
node tools\verify-branch.mjs --repo .. --base office3d/rev-20261022 --head HEAD --config verify.json
```

head 不是当前检出时，脚本会自动 `git worktree add --detach` 到系统临时目录，结束后 `git worktree remove --force` 并删除临时目录。

## 真实示例配置（pngmini）

`pngmini.mjs` 是纯模块，现有 `tests/pngmini.test.mjs` 用相对 `import` 而不是 envVar 读取被测模块，所以示例打开 `module.mirrorTests`。另外：本示例写在 DS-6 分支上，而基线 `office3d/rev-20261022` 已包含 pngmini 的合并，因此在**本分支**直接运行时范围检查还会看到本工具自身的三个文件；示例把这三件套也列入 `allowedChanges` 以便在 DS-6 分支上演示。验收其它分支时，请把 `allowedChanges` 换成该分支的实际变更清单。

```json
{
  "allowedChanges": [
    "office3d/tests/pngmini.test.mjs",
    "dispatch/deepseek/outbox/DS-1-report.md",
    "office3d/tools/verify-branch.mjs",
    "office3d/tools/verify-branch.md",
    "office3d/tests/verify-branch.test.mjs",
    "dispatch/deepseek/outbox/DS-6-report.md"
  ],
  "protectedFiles": ["office3d/pngmini.mjs"],
  "tests": { "cwd": "office3d", "files": ["tests/pngmini.test.mjs"] },
  "module": {
    "path": "office3d/pngmini.mjs",
    "envVar": "PNGMINI_MODULE",
    "companions": [],
    "mirrorTests": true
  },
  "mutations": [
    {
      "name": "paeth-tie",
      "find": "pa <= pb && pa <= pc ? a : pb <= pc ? b : c",
      "replace": "pa < pb && pa < pc ? a : pb <= pc ? b : c"
    },
    {
      "name": "average-shift",
      "find": "v += (a + b) >> 1",
      "replace": "v += (a + b) >> 2"
    },
    {
      "name": "palette-index",
      "find": "plte[i * 3]",
      "replace": "plte[i * 3 + 1]"
    },
    {
      "name": "intentional-not-applied",
      "find": "this string is intentionally absent",
      "replace": "x"
    }
  ],
  "scan": { "forbiddenApis": [], "extraTerms": [] }
}
```

## 扫描规则

只扫描 `allowedChanges` 中实际变更的文件；命中时只输出**文件名 + 行号 + 规则名**，不输出命中原文。规则：私钥头、`sk-` / `ghp_` / `github_pat_` / `AKIA` / Slack `xox?-` 令牌、`Bearer <长串>`、`password|secret|api_key|access_token` 形如赋值的长字符串、IPv4、Windows 盘符路径、macOS 用户目录路径、`scan.forbiddenApis`、`scan.extraTerms`。
