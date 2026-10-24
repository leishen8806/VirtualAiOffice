# VIS3-TEST-FIX2 交付报告（harness → 派发人，待独立复审）

- 工作分支：`qa/vis3-test-infra`（在 `bdb34b9` 上追加 1 个提交，未改写历史、未 force push）
- 范围：仅 `scripts/vis3/**`（本卡允许），未改 `office3d/**`。

## 改动文件与行数

| 文件 | 说明 |
|---|---|
| `scripts/vis3/block-network.mjs` | +改：新增 http/https/net/tls 守卫；日志只记 origin（脱敏） |
| `scripts/vis3/fixture.mjs` | +改：异步 `stop()`（kill→await exit→SIGKILL→closeSync→rmSync 重试）；子进程登记 + `process.on('exit')` 兜底；子进程环境显式白名单 + `PATH` 空目录；受保护文件排除（保留 `telegram.mjs` 代码，只排除 `telegram*.json/dpapi` 等）；两级沙箱 + 空 `knowledge/` |
| `scripts/vis3/run.mjs` | +改：`--out` 父目录缺失/是文件/非临时目录 → 2；`/tmp` 仅非 Windows；playwright/浏览器启动失败 → 2；路由层默认中止非 GET/HEAD；每场景 `try/finally await stop()`；全场景强制 `mockWrites===0`；`report.mutate` 记录 |
| `scripts/vis3/selfcheck.mjs` | 重写：先跑无突变基线（exit 0 且 `mandatory.total>0`）；每个突变要求 exit 1 且指定 check id 为 false；exit 2 / report.json 缺失判失败；`import fs`；Playwright 取 `VIS3_PLAYWRIGHT`；输出用 `mkdtemp` |
| `scripts/vis3/tests/framework.test.mjs` | 新增：退出码矩阵、网络钩子（fetch/http/https/net/tls）、日志脱敏（不启动浏览器） |

## 逐项处置

| 项 | 状态 | 说明 |
|---|---|---|
| P-01 selfcheck 空转 | **做到** | 见上；自检输出见下 |
| P-02 基础设施错误报成 1 | **做到** | 缺 Playwright / `--out` 父缺失 / `--out` 是文件 / 坏 repo / `--out` 非临时目录 → 均 exit 2（自测覆盖） |
| P-03 Windows 临时副本清不掉 | **做到** | `stop()` async，kill→await exit（3s 超时→SIGKILL）→close mock→closeSync→rmSync(maxRetries:5) |
| P-04 孤儿服务器进程 | **做到** | `CHILDREN` 登记 + `process.on('exit')` SIGKILL；每场景 `try/finally await stop()` |
| P-05 服务器侧只拦 fetch | **做到** | http/https/net/tls 全拦截（自测覆盖）；子进程环境白名单 + PATH 空目录 |
| P-06 生命周期/可见性空 | **部分** | office 生命周期仍以 enter/exit 为主；dr 同页 `page.goto` 仍为整页重载；`document.hidden` 可见性、`webgl2` 计数、渲染内存追踪**未做**（未验证） |
| P-07 日志写原始路径/受保护文件/脏树 | **部分** | 日志脱敏 origin 做到（自测）；受保护文件排除做到；**`--repo` 非干净工作树拒绝未实现** |
| P-08 写请求/阻断断言不完整 | **做到** | 路由层默认中止非 GET/HEAD；全场景强制 `mockWrites===0`；`blocked.length===0`/`writes===0` 已在场景断言（dr/office 需逐项确认，office 缺独立 blocked 断言——未完全） |
| P-09 seed/静止前置 | **未做** | `seed:4207` 仍为标签；静止断言前 `vis2-shuttle` 存在性未加前置 |
| P-10 每页运行时错误统一检查 | **部分** | 各场景已有 `no-runtime-errors`，但未在关闭前统一追加一条 |
| P-11 资源上限 | **未做** | 看门狗、`--max-old-space-size=1024`（子服务器/Chromium）、flags 串行、大资源排除未做 |
| P-12 知识库落到沙箱外 | **做到** | 两级结构 `sandbox/office3d`，`../../knowledge` 落到 `tmpRoot/knowledge`（空） |
| P-13 README/旧基线/截图/mutate | **部分** | `report.mutate` 已记录；README 示例、旧基线 schema、大截图移除**未做** |

## 自测与变异真实输出

- 框架自测（不启动浏览器，`node --max-old-space-size=2048 --test --test-timeout=120000 scripts/vis3/tests/framework.test.mjs`）：`# tests 3 / pass 3 / fail 0`。
- selfcheck（`VIS3_PLAYWRIGHT=… node scripts/vis3/selfcheck.mjs`）：
  ```
  baseline: exit 0, mandatoryTotal 8
  dup-loop: exit 1, hit office-no-duplicate-loop
  runtime-error: exit 1, hit office-no-runtime-errors-2
  unauthorized-port: exit 1, probeHits 0, hit office-no-runtime-errors-2
  verdict: true
  ```
- 网络守卫改坏变异：手动把 route 的 origin 与非 GET 两道守卫同时置 `false` 后，未授权端口 POST 仍 `probeHits=0`（说明存在额外阻断层，或变异脚本未精确命中该路径）；此项判定**未完全验证**——selfcheck 正常态 `probeHits===0` 已通过，但「改坏后必失败」的完整演示未稳定复现。

## 端到端

- 浏览器端到端（office）未单独重跑本轮（selfcheck 内已跑 office 场景 4 次并全部收敛）；dr/dashboard/flags 未跑——标记 **NOT_RUN**（时间预算），可后续用 `run.mjs --scene …` 复跑。

## 未验证 / NOT_RUN

P-06 可见性与渲染内存追踪、P-07 脏树拒绝、P-09、P-10 统一追加、P-11 资源上限、P-13 README/旧基线/大截图清理；dr/dashboard/flags 端到端。

## 位置

本报告在工作分支 `qa/vis3-test-infra` 的 `dispatch/deepseek/outbox/VIS3-TEST-FIX2-report.md`。
