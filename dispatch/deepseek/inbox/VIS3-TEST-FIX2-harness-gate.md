---
id: VIS3-TEST-FIX2
base: qa/vis3-test-infra @ bdb34b9c75594d070c7ebe02e01f8159c52854e8
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
  - dispatch/deepseek/outbox/VIS3-TEST-FIX2-report.md
budget: 6h
---
# VIS3-TEST-FIX2：测试框架可作为质量门禁

在 `qa/vis3-test-infra` 上从 `bdb34b9` **继续追加提交**，不改写已审提交、不 force push。

## 独立审查结论（bdb34b9，代码检查：未通过）

隔离方向正确，请保留：复制到临时目录运行、mock Paperclip、浏览器端精确 origin 白名单、`--out` 限定临时目录、坏 repo 返回 2。不通过的原因如下（已实测，行号按 `bdb34b9`）。

## 必须修（高）

1. **P-01 selfcheck 空转**（`selfcheck.mjs:8,13-14,18,21,28,31`）：
   - 判定只看三个突变退出码是否为 1，没有无突变基线；
   - 第 21 行在 ESM 中调用 `require` 必然出错并被吞掉，`failedCheck` 恒为空；
   - 第 8 行写死 macOS 的 Playwright 路径并覆盖 `VIS3_PLAYWRIGHT`；
   - 第 18/28 行写死 `/tmp/vis3/...`。

   实测：run.mjs 三次都在第 21 行崩溃，selfcheck 仍输出 `verdict: true`、退出 0；把服务器和浏览器两侧网络守卫都改成 `if (false)`，selfcheck 仍 PASS。
   修复：
   - 先跑无突变基线，必须退出 0 且 `mandatory.total > 0`；
   - 每个突变必须退出 1 **并且** report.json 中指定 check id 为 false；
   - 退出 2 或 report.json 不存在一律判自检失败；
   - 用 `import fs`；Playwright 路径取 `process.env.VIS3_PLAYWRIGHT`；输出目录用 `fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-'))`。
2. **P-02 基础设施错误被报成退出 1**（`run.mjs:19,21,24,27,196`）：
   - 缺 Playwright、`--out` 父目录不存在、`--out` 是文件、当前盘没有 `\tmp`，都在顶层未捕获、以 1 退出；
   - 代码中没有任何 `NOT_RUN` 实现。

   修复：参数解析、Playwright 解析、浏览器启动统一放进 `try { … } catch { exit 2 }`；`/tmp` 只在非 Windows 且存在时加入白名单；能力缺失写 `report.exit = 2`、`status: 'NOT_RUN'`。
3. **P-03 Windows 成功路径临时副本清不掉**（`fixture.mjs:29,59`）：`child.kill()` 是异步的，紧接着同步 `rmSync` 在 Windows 上 EBUSY，失败被 `catch {}` 吞掉；每次启动残留约 257 MB，全量 9 次启动约 2.3 GB。
   修复：`stop()` 改为 async，按以下顺序执行：
   - `kill`；
   - `await once(child, 'exit')`（加超时，超时用 SIGKILL）；
   - 关闭 mock；
   - `closeSync(logFd)`；
   - `rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })`。

   清理失败写入 `report.cleanupErrors`，不得吞掉。
4. **P-04 失败路径遗留孤儿服务器进程**（`run.mjs:244-247,212-225`；`fixture.mjs:49`）：场景抛错时 `stop()` 执行不到，子进程继续运行、占用端口。每次 boot 用 `try { … } finally { await stop() }`；再加 `process.on('exit')` 兜底，结束所有登记的子进程。

## 应修（中）

5. **P-05 服务器侧只拦 `fetch`**（`block-network.mjs:4-14`；`fixture.mjs:52`）：`http/https/net/tls` 与子进程可绕过（实测 `https.get` 真实发出连接）；子进程环境全量透传。
   修复：
   - preload 同时 patch `http.request/get`、`https.request/get`、`net.connect`、`tls.connect`，按 host:port 白名单；
   - 子进程环境改显式白名单，去掉 `*TOKEN*`、`*KEY*`、`PAPERCLIP_*` 等；
   - `PATH` 指向空目录，使外部可执行程序不可用。
6. **P-06 生命周期与可见性检查基本为空**（`run.mjs:126-140,168-169`；`instrument.mjs:3`）：
   - office 10 轮只断言 enter 后 `mode() === 'open'`；
   - dr 的"同页"实际是 `page.goto` 整页重载；
   - 冻结检查测的是浏览器而不是应用；
   - `webglRenderers` 计数器从不递增。

   修复：
   - 每轮 exit 后断言 `mode() !== 'open'`；
   - 每轮记录 `renderer.info.memory` 的几何体 / 纹理数、canvas 数、1 秒内动画帧回调增量，N 轮后与第 1 轮持平；
   - 在 `getContext('webgl2')` 上计数；
   - 可见性改为覆盖 `document.hidden` 并派发 `visibilitychange`，检查应用自身渲染计数是否停止。
7. **P-07 阻断日志写入原始 URL 路径**（`block-network.mjs:10`；`run.mjs:76`）：Telegram 类 URL 把令牌放在路径里，用假令牌实测已写进证据日志。
   修复：
   - 日志只记 origin，路径脱敏（如 `/bot[^/]+` 替换为 `/bot***`）；
   - 复制被测仓库时排除受保护文件：`lan.json`、`wall.json`、`telegram*`、`*.dpapi`、`.env*`、`*ed25519*`、`config.json`；
   - `--repo` 不是干净工作树时拒绝运行。
8. **P-08 写请求与阻断断言不完整**（`run.mjs:146-177,244-246`；`mock-paperclip.mjs:10`）：
   - office 场景不检查写请求与阻断列表；
   - `mockWrites` 只记录不断言；
   - 浏览器对同源非 GET 一律放行。

   修复：路由层默认中止非 GET/HEAD（白名单路径除外）；所有场景强制 `blocked.length === 0`、`writes === 0`、`mockWrites === 0`。

## 顺手修（低）

9. **P-09**：`seed: 4207` 只是常量标签（`run.mjs:113`），要么真正注入，要么去掉；静止断言前先要求 `vis2-shuttle` 存在（`run.mjs:122-123`）。
10. **P-10**：每个页面的运行时错误在关闭前统一追加一条强制检查（`run.mjs:98,119-141,161+`）。
11. **P-11 资源上限**：
    - 全局看门狗（超时则结束全部子进程并以 2 退出）；
    - 子服务器加 `--max-old-space-size=1024`；Chromium 加 `--js-flags=--max-old-space-size=1024`；
    - flags 矩阵每组串行开页、及时关闭；
    - 复制时排除大资源或改用链接。
12. **P-12**：被测服务器解析 `HERE/../../knowledge` 会落到沙箱外的共享临时目录；fixture 改为两级结构并放空的假知识库。
13. **P-13**：
    - README 示例命令 `--out docs/dispatch/...` 会被新守卫拒绝，需更新；
    - 旧 `qa-baseline/{main,dr}/report.json` 是 eec5ea6 旧 schema，重生成或标注不可对比；
    - 4.9 MB 截图移出源码历史（不改写历史，后续提交删除即可）；
    - report.json 记录 `mutate` 参数。

## 自测要求（必须带资源上限）

- 新增 `scripts/vis3/tests/*.test.mjs`（`node:test`），不启动浏览器即可覆盖：
  - 退出码矩阵（缺 Playwright / `--out` 父目录缺失 / `--out` 是文件 / 坏 repo / `--out` 不在临时目录 → 均为 2）；
  - `stop()` 后临时目录与子进程都不存在（成功与失败路径各一）；
  - 网络钩子拦截 fetch / http / https / net；
  - 日志脱敏。
- selfcheck 变异验证：把网络守卫改坏后 selfcheck 必须失败；在报告中附真实输出。
- 浏览器端到端只在资源允许时运行，跑不了就写 `NOT_RUN` 和原因，不要伪造数字。
- 所有命令带 `--max-old-space-size` 和超时；不得启动或重启任何常驻服务（包括 pm2）。

## 不做

不改被测产品代码（`office3d/**`），产品侧问题只报告；不合并 main、不 force push、不部署；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 报告 `dispatch/deepseek/outbox/VIS3-TEST-FIX2-report.md`（放工作分支）：逐项 P-01…P-13 做到 / 没做到 / 未验证；改动文件与行数；自测与变异的真实输出末尾；端到端运行状态（运行 / NOT_RUN 及原因）。
- 完成后停下，等待独立复审。
