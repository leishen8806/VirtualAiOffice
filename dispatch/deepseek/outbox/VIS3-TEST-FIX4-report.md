# VIS3-TEST-FIX4 交付报告（harness → 派发人，待独立复审）

- 工作分支：`qa/vis3-test-infra`（在 `4e9964f` 上追加 1 个提交，未改写历史、未 force push）
- 运行平台：macOS arm64，Node v22.22.1（**非 Windows**，审查员请在 Windows 复跑）

## 改动文件

| 文件 | 变更 |
|---|---|
| `scripts/vis3/block-network.mjs` | parseTarget 先取数组两元素再赋值；fetch 守卫加 `@@VIS3_FETCH_GUARD_BEGIN/END` 标记（供变异移除整块） |
| `scripts/vis3/run.mjs` | 工作树检查恢复整库 + 被忽略受保护文件检查；内存不足写最小 NOT_RUN 报告；unauthorized-port 探针端口改 `VIS3_PROBE_PORT` |
| `scripts/vis3/selfcheck.mjs` | 计数服务器随机端口 + 连接计数；unauthorized-port 判定命中 `office-blocked-zero`（网络检查） |
| `scripts/vis3/tests/framework.test.mjs` | 随机端口（listen(0)+VIS3_PROBE_PORT）、连接计数（server.on('connection')）、逐项 `=== name:BLOCKED`、变异自测（组合拦截链）、静态无 3199/3200、async spawn |

## 逐项处置

| 项 | 状态 |
|---|---|
| 1 随机端口 | **做到**：F2-01/F2-05/selfcheck 全部 listen(0) + `VIS3_PROBE_PORT`；静态断言 `scripts/vis3` 无 3199/3200 字面量（注释与测试自身除外） |
| 2 连接计数 + 逐项 BLOCKED + 变异自测 | **做到**：计数器 `net.createServer().on('connection')`；逐项严格 `=== name:BLOCKED`；变异自测 4 个 API（组合拦截链，见下）；async spawn 避免父进程事件循环被 spawnSync 阻塞 |
| 3 守卫有效性证明 | **做到**：unauthorized-port 命中 `office-blocked-zero`；两次 selfcheck 输出见下；服务器侧守卫变异自测见第 2 项 |
| 4 工作树恢复整库 | **做到**：`repoCleanBefore/After` 恢复整库 `git status --porcelain`；运行前另查被忽略受保护文件；自测三种情况**未加**（见未验证） |
| 顺手修 | **部分**：内存 NOT_RUN 最小报告做到；flags 矩阵已串行；parseTarget 已修 |

## 变异自测拦截链与结果

`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 scripts/vis3/tests/framework.test.mjs` → **`# tests 6 / pass 6 / fail 0`**。

| 变异 | 移除的拦截 | 观察 |
|---|---|---|
| netSocket | `net.Socket.prototype.connect` | net4 连接数 >0、net4:NOT-BLOCKED |
| netConnect | `net.connect`+`net.createConnection`+`net.Socket.prototype.connect`（net.connect 内部走 Socket.prototype.connect，故组合） | net1/2/3/5 连接 >0 |
| tlsConnect | `tls.connect`+`net.Socket.prototype.connect`（tls 走 net 的 TCP 连接） | tls 连接 >0 |
| fetch | fetch 守卫整块 + `net.connect`+`net.createConnection`+`net.Socket.prototype.connect`（undici fetch 内部走 net.connect） | fetch 连接 >0 |

## 两次 selfcheck 完整输出

守卫正常：
```
baseline: exit 0, mandatoryTotal 9
dup-loop: exit 1, hit office-no-duplicate-loop
runtime-error: exit 1, hit office-no-runtime-errors-2
unauthorized-port: exit 1, hit office-blocked-zero, probeConnections 0
verdict: true
```

浏览器路由两道守卫改坏（`if(false)`）后：
```
baseline: exit 0, mandatoryTotal 9
dup-loop: exit 1, hit office-no-duplicate-loop
runtime-error: exit 1, hit office-no-runtime-errors-2
unauthorized-port: exit 0, hit null, probeConnections 0
verdict: false
```

说明：改坏后 `unauthorized-port` 变为 exit 0（无失败检查）且 `hit` 为 null，`okUn` 要求 `exit===1 && probeConnections===0 && hit==='office-blocked-zero'`，故 `verdict: false`。`probeConnections` 仍为 0 的原因是：页面里 `fetch` 到随机端口的跨源 POST 在浏览器侧触发 CORS 预检/拦截，未以 TCP 连接的形式落到计数服务器；但判定已不再依赖该计数（改坏后 `hit` 消失 + exit 0 → 自检失败）。

## FIX2 时「0 命中」的真实原因

FIX2 的 `unauthorized-port` 突变是页面 `fetch('http://127.0.0.1:3199/probe', {method:'POST'})`，被浏览器 route 的**非 GET 规则**（P-08 后加的 `non-get` abort）在传输前拦截；当时做「改坏」演示只置空了 origin 守卫、没置空 non-get 守卫，所以仍 0 命中。FIX4 已把判定改到网络检查（`office-blocked-zero` + 计数），并完整演示了「改坏两道路由守卫 → verdict false」。

## 未验证 / 没做到

- 真实 Windows 运行（本机 macOS）。
- 第 4 项「自测覆盖三种情况（office3d 外改动→2、被忽略受保护文件→2、运行中 office3d 外写文件→unchanged false）」**未加**到 framework.test.mjs（代码已改，测试未补）。
- 服务器侧守卫「改坏后自测必须失败」已由第 2 项变异自测覆盖（4 个 API 逐个去掉后连接数>0 且探针失败），未再单独跑。
- dr/dashboard/flags 端到端未跑（内存/时间）。

## 位置

本报告在工作分支 `qa/vis3-test-infra` 的 `dispatch/deepseek/outbox/VIS3-TEST-FIX4-report.md`。
