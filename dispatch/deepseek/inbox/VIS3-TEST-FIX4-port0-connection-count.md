---
id: VIS3-TEST-FIX4
base: qa/vis3-test-infra @ 4e9964fe6f50094985b41353ade02494f4c535ef
branch: qa/vis3-test-infra
scope:
  - scripts/vis3/block-network.mjs
  - scripts/vis3/run.mjs
  - scripts/vis3/selfcheck.mjs
  - scripts/vis3/fixture.mjs
  - scripts/vis3/tests/
  - docs/dispatch/vis3/
  - dispatch/deepseek/outbox/VIS3-TEST-FIX4-report.md
budget: 3h
---
# VIS3-TEST-FIX4：自测改随机端口、按连接计数、补齐守卫有效性证明、工作树检查恢复整库

Q-V1 复审 FIX3（`4e9964f`）的结论是**需小返工**。

已通过、请保留：

- F2-01 守卫代码：审查员按 TCP 连接数实测，FIX3 守卫下 5 种 net 写法与 tls 全部被拦、连接数 0；同样的测法换成旧守卫，有 4 种写法连上；
- F2-04 自测清理；
- F2-05 `http.get` 放行（代码）；
- P-08 office 阻断断言；
- P-11 资源上限：审查员实测空闲 2,470 MB 时退出 2，并提示 NOT_RUN。

在 `qa/vis3-test-infra` 上从 `4e9964f` **继续追加提交**；不改写已审提交、不 force push。

## 必须修（P1）

### 1. 所有自测与探针改用随机端口

审查员在 Windows 实机（项目的实际运行平台）上运行 `framework.test.mjs`：4 项，**3 过 1 败**。`F2-05` 写死监听 `127.0.0.1:3200`，而本机 3200 端口被办公室服务占用，报 `listen EACCES`。`F2-01` 的计数服务器写死 3199，`run.mjs` 第 74 行的浏览器探针与 `selfcheck.mjs` 的计数服务器也写死 3199。

- 所有测试服务器与计数服务器都 `listen(0)`；实际端口通过环境变量传给子进程与页面探针（例如 `VIS3_PROBE_PORT`），`VIS3_ALLOWED_PORTS` 同样用实际端口。
- 任何地方都不得依赖 3199 / 3200 空闲；加一条静态断言：`scripts/vis3/` 中不再出现字面量 `3199` / `3200`（注释除外）。

### 2. 计数改为"连接数"，并逐项断言被拦

现状：计数服务器 `http.createServer((req, res) => { hits.n++ })` 只在收到完整的 HTTP 请求时计数。5 种 net 写法与 tls 只建立 TCP 连接、不发 HTTP 请求，即使连上了计数也是 0。

- 审查员演示：不加载守卫时，6 次原始 net / tls 连接全部到达服务器，`connection = 6`，`request = 0`。
- 变异检查：把守卫换回 `9d577f5` 旧版后，该测试确实失败，但失败点是子进程被打开的连接挂住、超时（`status === null`），**不是**命中数断言。

要做：

- 计数服务器改为 `server.on('connection', …)` 计数（可同时记录 request）。计数服务器放在**不加载守卫的独立进程**里，或放在加载守卫之前启动的进程里，并说明理由。
- 每次尝试断言严格等于 `name + ':BLOCKED'`（fetch 断言 promise 以 `VIS3_NETWORK_BLOCKED` 拒绝），并断言连接数为 0。
- 子进程设短超时（如 20 秒），结束前销毁所有 socket；挂起直接判失败，并给出明确报错。
- **新增变异自测**（`scripts/vis3/tests/`）：在临时目录生成守卫副本，每次去掉一个 API 的拦截，分别运行同一组探针，每一轮都必须观察到连接数 > 0、并且探针断言失败。要去掉的 API 依次为：
  1. `net.Socket.prototype.connect`；
  2. `net.connect`；
  3. `tls.connect`；
  4. fetch。

  若某一项去掉后仍为 0 连接（例如被下层拦截兜住），在报告中写明拦截链，并改为去掉"该路径上全部拦截"的组合变异。

## 应修（P2）

### 3. 补齐守卫有效性证明（FIX3 卡第 4 条未完成的部分）

- 写明 **FIX2 时**"关闭浏览器两道守卫后，未授权端口仍 0 命中"的真实原因（例如：探针请求实际没有发出、被另一层拦截、计数方式看不见），附验证方法。
- 贴出两次 `selfcheck.mjs` 的**完整真实输出**：
  - 守卫正常：`verdict: true`，`unauthorized-port` 的 `probeHits: 0`；
  - 浏览器守卫改坏：`verdict: false`，`probeHits > 0`。
- `unauthorized-port` 突变的判定必须命中**网络类检查**（例如 `probeHits` 或 network-allowlist 类检查），不能只靠 `office-no-runtime-errors-2` 这类页面报错检查。
- **服务器侧守卫改坏演示**：按第 2 项的变异自测执行，并贴出输出。FIX3 回执写"同理，不再重复跑"，不接受。

### 4. 工作树检查恢复整库

FIX3 把运行前的干净检查与运行后的隔离检查（`repoCleanBefore` / `repoCleanAfter`）都缩到了 `-- office3d`，`office3d` 以外的改动因此不再被发现，削弱了 FIX2 已通过的文件系统隔离检查。

- 两处恢复为整个工作树的 `git status --porcelain`。
- 运行前另查被忽略的受保护文件：用 `git status --porcelain --ignored`，或 `git ls-files --others --ignored --exclude-standard`，对照受保护文件名单。存在则退出 2，报告只写文件名，不读内容。
- 如果确实需要放宽，单独列出允许的路径（白名单），并在报告中说明理由。
- 自测覆盖三种情况：
  - `office3d` 外有未提交改动 → 退出 2；
  - 存在被忽略的受保护文件 → 退出 2；
  - 运行中在 `office3d` 外写文件 → `filesystemIsolation.unchanged === false`。

## 顺手修（P3）

- 空闲内存不足退出时，同时在 `--out` 写出最小报告：`{ status: 'NOT_RUN', reason, freeMB, thresholdMB }`。
- flags 矩阵：每个变体的 root、campus、layout2 三个页面依次打开、用完即关，不要同时打开。
- `parseTarget` 第一行改为先取数组的两个元素，再重新赋值（现在写法是 `a0 = a0[0]` 之后再读 `a0.length`）。

## 不做

不改被测产品代码（`office3d/**`）；不合并 `main`、不 force push、不部署；不启动或重启任何常驻服务（包括 pm2）；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后告诉派发人完整 SHA。
- 报告 `dispatch/deepseek/outbox/VIS3-TEST-FIX4-report.md` 写明：
  - 做到 / 没做到 / 未验证（逐项）；
  - 运行平台与 Node 版本；
  - 自测真实输出末尾；
  - 变异自测各轮的连接数；
  - 两次 selfcheck 完整输出；
  - FIX2 时 0 命中的原因。
- 你的环境若不是 Windows，请如实注明；审查员会在 Windows 上复跑。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=120000 --test-concurrency=1 scripts/vis3/tests/*.test.mjs`。
- 完成后停下，等待独立复审。
