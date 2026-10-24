---
id: VIS3-TEST-FIX5
base: qa/vis3-test-infra @ bc43d7263c5fef70ae021afbd2fa8764db52a793
branch: qa/vis3-test-infra
scope:
  - scripts/vis3/run.mjs
  - scripts/vis3/selfcheck.mjs
  - scripts/vis3/block-network.mjs
  - scripts/vis3/tests/
  - docs/dispatch/vis3/
  - dispatch/deepseek/outbox/VIS3-TEST-FIX5-report.md
budget: 3h
---
# VIS3-TEST-FIX5：Windows ECONNRESET、工作树自测、守卫改坏时的真实连接、P3 收尾

Q-V1 复审 FIX4（`bc43d72`）的结论是**需小返工**。以下已通过，请保留：

- 随机端口，以及"无 3199 / 3200 字面量"的静态断言；
- 连接级计数，逐项断言 `=== name:BLOCKED`；
- FIX2 时 0 命中的原因说明（非 GET 规则仍在拦截）；
- `unauthorized-port` 命中网络类检查 `office-blocked-zero`；
- 工作树检查恢复为整库；
- 内存不足时写出 NOT_RUN 报告；
- `parseTarget` 修正。

在 `qa/vis3-test-infra` 上从 `bc43d72` **继续追加提交**；不改写已审提交，不 force push。

## 必须修（P1）

### 1. 变异自测在 Windows 上稳定失败

审查员在 Windows 11 / Node 25 上运行 `framework.test.mjs`：6 项，5 过 1 败。单独重跑失败项 3 次，3 次都失败：

```
not ok 3 - FIX4 变异自测：逐个去掉守卫 API，连接数>0 且探针失败
  failureType: 'uncaughtException'
  error: 'read ECONNRESET'
```

- 原因：第 36 行的计数服务器 `srv.on('connection', (sock) => { state.conn++; … })` 没有给 `sock` 挂 `'error'` 监听。变异轮次中客户端连上后立即销毁，Windows 会在服务端 socket 上抛出 `ECONNRESET`，成为未捕获异常。
- 审查员验证：只加 `sock.on('error', () => {})`，Windows 上 6/6 通过，用时 2.8 秒。
- 要做：
  - 所有计数服务器与测试服务器的连接都挂上 `'error'` 监听，包括 `framework.test.mjs` 与 `selfcheck.mjs`；
  - 新增一条自测：客户端连上后立刻 `destroy()`，服务器进程不得出现未捕获异常（Windows 上可以复现这一情况）。

## 应修（P2）

### 2. 补齐工作树检查的三种自测（FIX4 卡第 4 项）

在临时 git 仓库中构造以下三种情况，不需要浏览器，可以用 `--scene` 的参数校验阶段或最小场景：

| 情况 | 期望 |
|---|---|
| `office3d` 之外有未提交改动 | `run.mjs` 退出 2，提示工作树不干净 |
| 存在被忽略的受保护文件（例如 `.gitignore` 忽略的 `lan.json`） | 退出 2，只列文件名、不读内容 |
| 运行中有代码在 `office3d` 之外写文件 | 报告 `filesystemIsolation.unchanged === false` |

第三种情况如果必须启动浏览器才能触发，可以把"运行后再比较一次工作树"的逻辑抽成可单独调用的函数，对这个函数做单元测试。

### 3. 守卫改坏时必须观察到真实连接

FIX4 中，浏览器路由两道守卫都改坏后，`probeConnections` 仍为 0，回执解释为"跨源 POST 触发 CORS 预检"。但探针是 `fetch(url, { method: 'POST', body: 'x' })`，请求体为 `text/plain`，属于**简单请求，不发预检**，这个解释不成立。目前 selfcheck 失败只是因为改坏后没有任何检查失败，并没有看到真实泄漏。

- 在守卫改坏的那次运行中，记录以下内容，找出 0 连接的**真实原因**并写进报告：
  - 探针 fetch 的结果（resolve / reject 及错误信息）；
  - Playwright 的 `request` 与 `requestfailed` 事件；
  - `INSTRUMENT` 初始化脚本是否包装了 fetch。
- 调整探针，使"守卫改坏 → `probeConnections > 0`"能实际复现。可以考虑 `navigator.sendBeacon`、`new Image().src`（GET）或 `fetch(…, { mode: 'no-cors' })`，按真实原因选择。
- selfcheck 判定保持两层：
  - 守卫正常 → `office-blocked-zero` 命中、0 连接；
  - 守卫改坏 → 连接数 > 0、`verdict: false`。
- 报告贴出两次 selfcheck 的完整真实输出。

## 顺手修（P3）

4. **flags 矩阵仍同时打开 3 个页面**：每个变体的 root、campus、layout2 三个上下文最后才一起 `close`。FIX4 回执写"已串行"，与代码不符。改为每页用完即关，并在本次回执中更正 FIX4 的说法。
5. **F2-05 空闲端口竞态**：先 `listen(0)` 取端口再关闭、交给子进程，中间可能被占用。改为子进程自己 `listen(0)`，把端口输出给父进程。
6. **被忽略受保护文件检查可能误报**：`git ls-files --others --ignored --exclude-standard` 会逐个列出 `node_modules/` 等被忽略目录中的全部文件，正则包含 `config.json`，任何依赖包里的 `config.json` 都会让运行被拒绝。
   - 加 `--directory`（不进入被忽略目录），并且不检查 `node_modules/`；
   - 受保护文件名单收紧为明确的文件名：`lan.json`、`wall.json`、`telegram*.json`、`*.dpapi`、`.env*`、`*ed25519*`、`office3d/config.json`。
   - `niuma.config.json`：**董事会尚未裁决**。本卡默认处理方式：
     - 复制到沙箱时排除；
     - 运行时只列名警告、不拒绝运行；
     - 在报告中单独列出这项默认处理，等待董事会确认。

## 不做

不改被测产品代码（`office3d/**`）；不合并 `main`、不 force push、不部署；不启动或重启任何常驻服务（包括 pm2）；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后告诉派发人完整 SHA。
- 报告 `dispatch/deepseek/outbox/VIS3-TEST-FIX5-report.md` 写明：
  - 做到 / 没做到 / 未验证（逐项）；
  - 运行平台与 Node 版本；
  - 自测真实输出末尾；
  - 第 3 项的真实原因与两次 selfcheck 完整输出。
- 你的环境若不是 Windows，请如实注明；审查员会在 Windows 上复跑。**本卡的 P1 只有在 Windows 上通过才算完成。**
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=120000 --test-concurrency=1 scripts/vis3/tests/*.test.mjs`。
- 完成后停下，等待独立复审。
