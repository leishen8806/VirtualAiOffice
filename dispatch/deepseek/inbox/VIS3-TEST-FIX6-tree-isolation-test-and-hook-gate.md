---
id: VIS3-TEST-FIX6
base: qa/vis3-test-infra @ 95dab745c152541b93a76dacfa19d8b21b82412b
branch: qa/vis3-test-infra
scope:
  - scripts/vis3/block-network.mjs
  - scripts/vis3/run.mjs
  - scripts/vis3/fixture.mjs
  - scripts/vis3/tests/
  - dispatch/deepseek/outbox/VIS3-TEST-FIX6-report.md
budget: 1h
---
# VIS3-TEST-FIX6：补第三种工作树自测；测试放行接口只在自测中可用

FIX5（`95dab74`）**有条件通过**：Windows 上自测 9/9；ECONNRESET 已修；selfcheck 改坏后 0 连接的真实原因（同步调用阻塞事件循环）成立；flags 逐页打开、端口竞态、被忽略文件检查都已修好。剩两项 P2，本卡收尾。

在 `qa/vis3-test-infra` 上从 `95dab74` **继续追加提交**；不改写已审提交，不 force push。

## 1. 第三种工作树自测（FIX4、FIX5 两轮未做）

把 `run.mjs` 中"运行后再比较一次工作树"的逻辑抽成可单独调用的函数，例如 `compareRepoClean(repo, before)`，返回 `{ repoCleanBefore, repoCleanAfter, unchanged }`。`run.mjs` 改为调用它，行为不变。

用临时 git 仓库做单元测试，不需要浏览器：

- 运行前干净 → 在 `office3d` 外写一个文件 → `unchanged === false`，且 `repoCleanAfter` 中列出该文件；
- 运行前干净 → 不写任何文件 → `unchanged === true`。

## 2. `globalThis.__vis3_allowPort` 只在自测中可用（P2）

FIX5 在 `block-network.mjs` 中新增了 `globalThis.__vis3_allowPort = (port) => ALLOWED.add(Number(port))`。这个守卫同样加载在被测服务（`office3d/server.mjs`）里，被测进程中任何代码都可以调用它，把本机任意端口加入白名单，例如 Paperclip 3100、生产办公室 3200；外部主机虽然仍会被拦，但本机服务的隔离被打开了口子。

- 只有在环境变量 `VIS3_TEST_HOOKS === '1'` 时才定义该接口；只在 `framework.test.mjs` 的 F2-05 子进程中设置这个变量。
- `fixture.mjs` 启动被测服务时，环境白名单中**不得**包含 `VIS3_TEST_HOOKS`，并显式删除它。
- 新增自测：
  - 不设置 `VIS3_TEST_HOOKS` 时，加载守卫后 `globalThis.__vis3_allowPort === undefined`；
  - 在被测服务的子进程环境中（`bootIsolated` 构造的 env），`VIS3_TEST_HOOKS` 不存在。

## 不做

不改被测产品代码（`office3d/**`）；不合并 `main`、不 force push、不部署；不启动或重启任何常驻服务（包括 pm2）；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后告诉派发人完整 SHA。
- 回执 `dispatch/deepseek/outbox/VIS3-TEST-FIX6-report.md`：做到 / 没做到 / 未验证；运行平台；自测真实输出末尾。审查员会在 Windows 上复跑。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=120000 --test-concurrency=1 scripts/vis3/tests/*.test.mjs`。
- 完成后停下，等待独立复审。
