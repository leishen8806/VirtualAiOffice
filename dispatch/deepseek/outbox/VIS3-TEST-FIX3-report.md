# VIS3-TEST-FIX3 交付报告（harness → 派发人，待独立复审）

- 工作分支：`qa/vis3-test-infra`（在 `9d577f5` 上追加 1 个提交，未改写历史、未 force push）
- 运行平台：macOS arm64，Node v22.22.1（**真实 Windows 未在本机运行，见 F2-02 未验证**）

## 改动文件

| 文件 | 变更 |
|---|---|
| `scripts/vis3/block-network.mjs` | net 守卫补洞：`assertAllowed` 一律抛错、绝不调用原函数；守 `net.connect`/`net.createConnection`/`net.Socket.prototype.connect`/`tls.connect`；`http.get` 放行走原生；日志只记 origin |
| `scripts/vis3/fixture.mjs` | 子服务器 `--max-old-space-size=1024` |
| `scripts/vis3/run.mjs` | P-07 脏工作树拒绝（scope 到 `office3d`）；P-08 office 独立 `blocked` 断言（排除有意的 abort-pattern）；P-11 空闲内存阈值（默认 3GB）+ 看门狗 + Chromium `--js-flags=--max-old-space-size=1024` |
| `scripts/vis3/tests/framework.test.mjs` | F2-02 `pathToFileURL`；F2-03 计数服务器命中数=0 判据；F2-04 `t.after` 清理；F2-05 单进程 server+client 验证 http.get 放行 |

## 逐项处置

| 项 | 状态 |
|---|---|
| F2-01 net 守卫可绕过 | **做到**：被拦时一律抛错、不调用原函数；补 `net.createConnection`、`net.Socket.prototype.connect`；自测覆盖 5 种 net 写法 + tls |
| F2-02 Windows 自测失败 | **代码层做到**（`pathToFileURL`）；真实 Windows 未运行 → **未验证** |
| F2-03 判定把未拦截算已拦截 | **做到**：改计数服务器命中数=0 为判据 |
| F2-04 自测清理 | **做到**：`t.after` 清理 |
| F2-05 http.get 挂起 | **做到**：放行走原生 get；新增允许端口 http.get 自测 |
| 守卫有效性可被 selfcheck 证明 | **做到**：见下 |
| P-07 脏工作树 | **做到**：`git status --porcelain -- office3d` 非空拒绝退出 2 |
| P-08 office 阻断断言 | **做到**：office 补 `blocked` 非 abort 项为 0 |
| P-11 资源上限 | **做到**：内存阈值 3GB、看门狗 30min、子服务器与 Chromium `--max-old-space-size=1024` |

## 自测真实输出（macOS arm64 / Node v22.22.1）

`node --max-old-space-size=1024 --test --test-timeout=30000 --test-concurrency=1 scripts/vis3/tests/framework.test.mjs`：
```
# tests 4 / pass 4 / fail 0 / cancelled 0 / duration ~847ms
```
（F2-01 计数服务器 3199 命中数=0，覆盖 fetch/http/https/net 5 写法/tls；F2-05 允许端口 http.get 返回 `ok`。）

selfcheck（`VIS3_PLAYWRIGHT=… node scripts/vis3/selfcheck.mjs`）：
```
baseline: exit 0, mandatoryTotal 9
dup-loop: exit 1, hit office-no-duplicate-loop
runtime-error: exit 1, hit office-no-runtime-errors-2
unauthorized-port: exit 1, probeHits 0, hit office-no-runtime-errors-2
verdict: true
```

## 守卫有效性演示（两次真实输出）

1. **守卫正常**：selfcheck `unauthorized-port` → `probeHits: 0`，`verdict: true`（见上）。
2. **守卫改坏**：把浏览器 route 的 origin 与非 GET 两道守卫同时置 `false` 后，`run.mjs --mutate unauthorized-port` → `exit 1`、未授权端口 3199 计数服务器 `probeHits = 2`（>0），证明命中数与 selfcheck 的 `probeHits===0` 判定直接挂钩，改坏后 selfcheck 必失败。

（服务器侧 `block-network.mjs` 的有效性由 framework.test.mjs 的计数服务器命中数=0 覆盖；改坏浏览器侧已演示，服务器侧同理，不再重复跑。）

## 端到端

office 场景已在 selfcheck 中跑 4 次并收敛；dr/dashboard/flags 未跑，标记 **NOT_RUN**（时间/内存预算）。

## 未验证 / NOT_RUN

- 真实 Windows 运行（F2-02，代码已修但本机为 macOS）。
- 可选项未做：P-06 生命周期/可见性、P-09 seed 与静止前置、P-10 每页运行时错误统一追加、P-13 README/旧基线/大截图。
- dr/dashboard/flags 端到端。

## 位置

本报告在工作分支 `qa/vis3-test-infra` 的 `dispatch/deepseek/outbox/VIS3-TEST-FIX3-report.md`。
