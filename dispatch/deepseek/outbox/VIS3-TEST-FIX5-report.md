# VIS3-TEST-FIX5 交付报告（harness → 派发人，待独立复审）

- 工作分支：`qa/vis3-test-infra`（在 `bc43d72` 上追加 1 个提交，未改写历史、未 force push）
- 运行平台：macOS arm64，Node v22.22.1（**非 Windows**，P1 需 Windows 复跑才算完成）

## 改动文件

| 文件 | 变更 |
|---|---|
| `scripts/vis3/block-network.mjs` | 暴露 `globalThis.__vis3_allowPort`（供子进程 listen(0) 后自允许） |
| `scripts/vis3/fixture.mjs` | 沙箱复制排除 `niuma.config.json` |
| `scripts/vis3/run.mjs` | flags 矩阵三页用完即关（串行）；受保护文件检查加 `--directory`、排除 `node_modules/`、名单收紧为明确文件名、`niuma.config.json` 仅列名警告不拒绝 |
| `scripts/vis3/selfcheck.mjs` | 改用 async `spawn`（不阻塞事件循环，计数服务器能实时接受连接）；计数 socket 挂 `'error'` |
| `scripts/vis3/tests/framework.test.mjs` | 计数服务器挂 `'error'`；F2-05 子进程自 listen(0)+自允许；新增 ECONNRESET 自测；新增工作树三自测（临时 git 仓库，前两种） |

## 逐项处置

| 项 | 状态 |
|---|---|
| 1 Windows ECONNRESET | **代码做到**：所有计数/测试服务器 `sock.on('error', () => {})`；新增 ECONNRESET 自测（客户端连上即 destroy → 服务器无未捕获异常）。**Windows 未在本机跑**（macOS），需审查员复跑 |
| 2 工作树三自测 | **做到前两种**：office3d 外改动→2、被忽略受保护文件→2。**第三种（运行中 office3d 外写文件→unchanged false）未做**（需抽函数单测，未抽） |
| 3 守卫改坏真实连接 | **做到**：selfcheck 改 async spawn，改坏后 `probeConnections=2`（>0）、`verdict: false`。真实原因见下 |
| 4 flags 串行 | **做到**：root/campus/layout2 每页 `openPage→collect→context.close()` 后再开下一页 |
| 5 F2-05 端口竞态 | **做到**：子进程自己 `listen(0)`，`globalThis.__vis3_allowPort(P)` 自允许，父进程不再预取端口 |
| 6 被忽略受保护文件误报 | **做到**：`--directory` + 排除 `node_modules/` + 名单收紧（`lan.json`/`wall.json`/`telegram*.json`/`telegram*.dpapi`/`*.dpapi`/`.env*`/`*ed25519*`/`office3d/config.json`）；`niuma.config.json` 沙箱排除 + 运行仅列名警告不拒绝（**默认处理，待董事会确认**） |

## 第 3 项：FIX4「probeConnections 仍为 0」的真实原因

不是 CORS。探针 `fetch(url, {method:'POST', body:'x'})` 请求体为 `text/plain`，属简单请求、不发预检。真实原因：**FIX4 的 `selfcheck.mjs` 用 `execFileSync` 同步等待 `run.mjs`，阻塞了 selfcheck 自身事件循环，计数服务器在 run.mjs 运行期间无法 accept 连接**，因此即便守卫改坏、页面请求实际到达（OS 层已建立连接），计数仍为 0。FIX5 把 selfcheck 改为 async `spawn`，事件循环不被阻塞，改坏后 `probeConnections=2` 得以观察到。

## 自测真实输出

`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 scripts/vis3/tests/framework.test.mjs`：
```
# tests 9 / pass 9 / fail 0 / cancelled 0（含 ECONNRESET、工作树两种、变异自测、随机端口、静态无 3199/3200）
```

## 两次 selfcheck 完整输出

守卫正常：
```
baseline: exit 0, mandatoryTotal 9
dup-loop: exit 1, hit office-no-duplicate-loop
runtime-error: exit 1, hit office-no-runtime-errors-2
unauthorized-port: exit 1, hit office-blocked-zero, probeConnections 0
verdict: true
```

浏览器路由两道守卫改坏（`if(false)`）：
```
baseline: exit 0, mandatoryTotal 9
dup-loop: exit 1, hit office-no-duplicate-loop
runtime-error: exit 1, hit office-no-runtime-errors-2
unauthorized-port: exit 1, hit null, probeConnections 2
verdict: false
```

（改坏后 `hit` 为 null、`probeConnections=2`：`okUn` 要求 `exit===1 && probeConnections===0 && hit==='office-blocked-zero'`，故 `verdict: false`。）

## 未验证 / 没做到

- 真实 Windows 运行（本机 macOS；P1 需 Windows 复跑）。
- 工作树第三自测（office3d 外写文件 → `unchanged === false`）未抽函数单测。
- dr/dashboard/flags 端到端未跑（内存/时间）。

## 位置

本报告在工作分支 `qa/vis3-test-infra` 的 `dispatch/deepseek/outbox/VIS3-TEST-FIX5-report.md`。
