---
id: VIS3-TEST-FIX3
base: qa/vis3-test-infra @ 9d577f5b94a56073d4dcd4dd9165b3f3b377a722
branch: qa/vis3-test-infra
scope:
  - scripts/vis3/block-network.mjs
  - scripts/vis3/fixture.mjs
  - scripts/vis3/instrument.mjs
  - scripts/vis3/mock-paperclip.mjs
  - scripts/vis3/run.mjs
  - scripts/vis3/selfcheck.mjs
  - scripts/vis3/tests/
  - docs/dispatch/vis3/
  - dispatch/deepseek/outbox/VIS3-TEST-FIX3-report.md
budget: 5h
---
# VIS3-TEST-FIX3：net 层守卫补洞、Windows 自测通过、守卫有效性可被自检证明、资源上限

**顺序**：先完成手上的 `D-V1-R4`，再做本卡。在 `qa/vis3-test-infra` 上从 `9d577f5` **继续追加提交**，不改写已审提交、不 force push。

## 代码检查结论（9d577f5：未通过）

已在代码层面修好、请保留：selfcheck 先跑无突变基线且要求命中指定 check；环境与参数错误退出 2；异步 `stop()`（等待退出 → SIGKILL → 关闭 → 带重试删除）；子进程登记与退出兜底；子进程环境白名单与空 `PATH`；复制时排除受保护文件；两级沙箱与空知识库；日志只记 origin；路由层默认中止非 GET/HEAD；各场景强制 `mockWrites === 0`。

审查只做了代码检查（审查环境内存紧张，没有运行浏览器与 selfcheck）。以下问题均已实测或从代码可直接确认。

## 必须修（高）

1. **F2-01 `net` 层守卫可被绕过（实测）**：`block-network.mjs` 的 `blockNet` 在调用方传了回调时只调用回调、不抛错，随后 `guardNet` 仍执行原始 `connect`；且只替换了 `net.connect` / `tls.connect` 两个属性。审查员用本地"未授权端口"计数服务器（`VIS3_ALLOWED_PORTS` 不含该端口）实测：

   | 写法 | 是否连到未授权端口 |
   |---|---|
   | `net.connect(port, host, cb)` | 连到 |
   | `net.connect({ port, host }, cb)` | 连到 |
   | `net.createConnection(port, host)` | 连到 |
   | `new net.Socket().connect(port, host, cb)` | 连到 |
   | `net.connect(port, host)`（无回调） | 被拦 |

   修复：被拦时**绝不调用原函数**，一律抛错（或返回立即 `destroy(err)` 的 Socket）；同时守住 `net.createConnection`、`tls.connect`、`net.Socket.prototype.connect`（`tls` 走 `TLSSocket`，确认同样被覆盖）。注意 `net.connect` 的回调是"连接成功"监听器，不能当作错误回调调用。
2. **F2-02 框架自测在 Windows 上失败（实测）**：`scripts/vis3/tests/framework.test.mjs` 中 P-05、P-07 用 `--import <绝对路径>` 加载守卫；Windows 上 Node 要求 `file://` URL，报 `ERR_UNSUPPORTED_ESM_URL_SCHEME`，守卫未加载。审查员在 Windows 上运行未改动代码：3 项，通过 1，失败 2；交付报告的 3/3 不成立。修复：用 `pathToFileURL(GUARD).href`。**Windows 是本项目的实际运行平台，自测必须在 Windows 上通过**；报告注明运行平台与 Node 版本。
3. **F2-03 P-05 自测判定会把"未拦截"算成"已拦截"**：`s.endsWith('BLOCKED')` 对 `fetch:NOT-BLOCKED` 也成立。改为严格等于 `k + ':BLOCKED'`；更好的做法是与第 1 条一致，用本地计数服务器的**命中数为 0** 作为判据，覆盖 fetch / http / https / net（上表 5 种写法）/ tls。
4. **守卫有效性必须能被 selfcheck 证明**：FIX2 报告自述"把浏览器路由的两道网络守卫同时置为 false 后，未授权端口探针仍 0 命中"，即 `unauthorized-port` 突变证明不了守卫有效。要求：
   - 查清 0 命中的真实原因（是否另有拦截层、突变是否没有命中实际请求路径、页面请求是否根本没有发出），在报告中写明；
   - 调整 `unauthorized-port` 突变或探针，使"守卫正常 → 0 命中、selfcheck 通过"与"守卫改坏 → 命中 > 0、selfcheck 失败"两种情况都能实际复现；
   - 在报告中贴出两次运行的真实输出。服务器侧守卫（`block-network.mjs`）同样做一次"改坏后自测必须失败"的演示。
5. **P-11 资源上限**（审查环境多次只有 1.4–2 GB 空闲内存，此项不能再缺）：
   - 全局看门狗（超时则结束全部子进程并以 2 退出，默认上限写入报告）；
   - 子服务器 `--max-old-space-size=1024`，Chromium `--js-flags=--max-old-space-size=1024`；
   - flags 矩阵每组串行开页、用完即关；
   - 运行前检查空闲内存，低于阈值（可配置，默认 3 GB）时以 2 退出并写 `status: 'NOT_RUN'` 与原因，不要硬跑。

## 应修（中）

6. **P-07 脏工作树**：`--repo` 不是干净工作树（`git status --porcelain` 非空，或存在被忽略的受保护文件）时拒绝运行，退出 2。
7. **P-08 office 阻断断言**：office 场景补独立的 `blocked.length === 0`（与 dr 一致）。FIX2 报告把 P-08 标"做到"，但正文写了"未完全"，本轮补齐后按实际写。
8. **F2-04 自测清理**：`framework.test.mjs` 三处 `mkdtempSync` 建的 `vis3-t-*` 目录不清理；每个 test 用 `t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))`。
9. **F2-05 `http.get` 改写**：`mod.get = (o, cb) => mod.request(o, cb)` 不会自动 `end()`，被允许的请求会挂起；放行时调用原生 `get`，或在 `request` 返回后 `.end()`。补一条"允许端口的 `http.get` 能正常拿到响应"的自测。

## 可选（低，时间允许再做）

P-06 生命周期与可见性检查、P-09 seed 与静止前置、P-10 每页运行时错误统一检查、P-13 README 示例与旧基线标注、大截图移出（后续提交删除，不改写历史）。未做的请在报告中如实列出。

## 不做

不改被测产品代码（`office3d/**`），产品侧问题只报告；不合并 main、不 force push、不部署；不启动或重启任何常驻服务（包括 pm2）；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后告诉派发人完整 SHA。
- 报告 `dispatch/deepseek/outbox/VIS3-TEST-FIX3-report.md`：逐项（F2-01～F2-05、守卫有效性、P-07、P-08、P-11 及可选项）做到 / 没做到 / 未验证；改动文件与行数；**运行平台**；自测真实输出末尾；第 4 条两次 selfcheck 的真实输出；端到端运行状态（运行 / NOT_RUN 及原因）。
- 测试必须带资源上限，例如 `node --max-old-space-size=1024 --test --test-timeout=120000 --test-concurrency=1 scripts/vis3/tests/*.test.mjs`。
- 完成后停下，等待独立复审。
