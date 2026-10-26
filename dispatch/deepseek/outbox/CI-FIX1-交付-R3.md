# CI-FIX1 交付回执 · R3（harness → 派发人，待 Q-V1 复核）

- 派单号：CI-FIX1-R3-01
- 代码分支：`fix/ci-portable-tests`（从 `main` @ `0f851d3`，在 `67b943d` 上继续）
- 自检框架分支：`qa/vis3-test-infra`（A7/A8 落地处）
- CI 运行（ubuntu + windows 均通过）：<https://github.com/leishen8806/VirtualAiOffice/actions/runs/40287877832>

## 结论

ubuntu、windows 两个 CI 作业**全绿**。所有返修项已处理。

## 逐条结果

### A1–A6（原卡 CI-FIX1 六类，均已通过）

| 项 | 内容 | 处置 |
|---|---|---|
| A1（A类 本机路径） | foyer-visit/waiting、pedestrian-stress 读 `E:/.../office3d-backup-*` | 证据缺失时明确跳过并写原因 |
| A2（B类 本机钩子） | memory 依赖 `knowledge/.git/hooks/pre-commit` | 钩子缺失时跳过并写原因 |
| A3（C类 误放文件） | `office3d/` 根目录误放的 warehouse-shell/town-nav 重复测试 | 删除根目录副本（tests/ 下早有更完整版本，覆盖不减少） |
| A4（D类 路径安全） | `insideRoots` 盘符大小写、允许根目录写死 | 按 win32/posix 分支写；tenant/evidence 测试 tempDir 用 realpath 规避平台不对称 |
| A5（E类 command-view-live 被取消） | Node 22 `AbortSignal.timeout` 为 unref，挂起探针被取消 | 挂起 mock 用 ref'd `setTimeout` 兜底保持事件循环存活 |
| A6（F类 align-data 路线矩阵） | `git show 83ecc1b` 需要历史 | checkout `fetch-depth: 0` |

### A7 / A8（R2 追加，本轮补做，落地在 `qa/vis3-test-infra`）

| 项 | 内容 | 处置 |
|---|---|---|
| A7 未运行不得算通过 | 没跑/旧报告/解析失败 → NOT_RUN/INCOMPLETE，不得通过 | 新增 `scripts/vis3/assess.mjs`（`readReport` + `assessRun`，含 sha 校验识别残留旧报告）；`selfcheck.mjs` 基线改用 `assessRun`；补 5 个负向测试（没跑 exit≠0 / 报告缺失 / 解析失败 / 残留旧报告 sha 不一致 / NOT_RUN / 未含检查项） |
| A8 只清理本次创建的目录 | 只删本次运行登记的确切路径，不按前缀猜；清理失败留确切原因 | `fixture.mjs` 抽出 `removeRegisteredDir`（只删 `vis3-iso-` 登记路径，拒绝未登记，失败返回原因）；补 2 个负向测试（同名前缀目录不被删、未登记目录被拒） |

### B1–B5（本轮返修项）

| 项 | 内容 | 处置 |
|---|---|---|
| B1 Windows #512（8.3 短名） | `sha256 一致/已变/缺失` 在 CI 失败 | **测试修法**：`tmp()` 改用 `fs.realpathSync.native`，让测试根目录展开短名为长名；**不改产品代码**。CI windows 已通过 |
| B2 补做 A7/A8 | 见上 | 已补，落地 `qa/vis3-test-infra` |
| B3 CI 文件清理 | push 触发删掉 fix 分支、说明三步覆盖、step summary 标题通用 | `push` 仅 `[main]`，靠 PR 触发；3 个步骤（Unit tests / Package spec tests / Packaged layout verification）等价于原 `npm run test:all`（=`npm test && npm run test:packages && npm run verify:packaged-layout`）；step summary 标题改为通用「Unit test failures」 |
| B4 少推送 | 本地复现后再推 | B1 本地 macOS 复现 21/21；A7/A8 本地 19/19 + selfcheck verdict=true；仅推送 2 个分支各 1 次验证 |
| B5 回执 | 按模板写 | 本文件 |

## 产品层发现（不改产品代码，交董事会决定）

`office3d/evidence-version.mjs` 的 `realOrResolve()` 对**存在的**路径用 `fs.realpathSync.native`（Windows 会展开 8.3 短名、加 `\\?\` 前缀），对**不存在的**路径退回 `path.resolve`（不展开）。因此在 8.3 短名路径（CI 临时目录 `C:\Users\RUNNER~1\...`）下，「文件不存在」会被误报成「路径不在允许范围」。测试侧用 `fs.realpathSync.native` 让根目录本身就是长名规避了误报；产品层的彻底修复需改 `realOrResolve()`（对不存在路径先用 native 规范化最近已存在祖先再拼回剩余部分），属产品代码，按卡片规定先报告、不在本卡改，由董事会决定是否另开小卡。

## 新增跳过及原因（共 5 项）

| 测试 | 跳过原因 |
|---|---|
| `foyer-visit` 静态边界：新增代码无禁词且路径模块保持纯净 | 本机 `office3d-backup-s1-4b` 证据不存在（CI 干净机器） |
| `foyer-waiting` static boundary keeps the director delta narrow… | 本机 `office3d-backup-s1-5b` 证据不存在（CI 干净机器） |
| `memory` 临时克隆：同一扫描器读取暂存内容… | `knowledge/.git/hooks/pre-commit` 本机证据不存在（CI 干净机器） |
| `memory` Claude 已接好的钩子先扫描后运行原守卫… | 同上 |
| `pedestrian-stress` legacy deadlock-fix backup still regresses… | 本机 `office3d-backup-deadlock-fix` 证据不存在（CI 干净机器） |

（另：`dr-console-layout` 三个几何/像素验收在无 playwright 时 skip「NOT_RUN」，以及 `town-map-api` 在源快照缺失时 skip「source snapshot not present」，为既有跳过，非本轮新增。）

## 位置与 SHA

- `fix/ci-portable-tests`：见推送后完整 SHA（回执提交即最终 SHA）
- `qa/vis3-test-infra`：`c13b10d3550c574ae9b386385503e6b8d9996f35`（A7/A8）
- 本回执：`dispatch/deepseek/outbox/CI-FIX1-交付-R3.md`
