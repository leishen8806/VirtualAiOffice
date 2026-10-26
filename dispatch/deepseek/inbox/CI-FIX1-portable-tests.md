# CI-FIX1 · 让 GitHub CI 在干净机器上跑通（测试基础设施卡）

- 执行人：harness（DeepSeek，流程/测试线）
- 下发：2026-10-26（董事会已同意）

## 背景

main 从 10-23 起每次合并 CI 都失败（最新 0f851d3：ubuntu 1614 项中失败 9、取消 16），所有开着的 PR 都跟着报红。本机全量测试只有 2 项环境失败，说明这些都是**测试离开本机就跑不了**的问题，不是产品故障。

CI 一直红着，就看不出真正的新问题，所以必须修。完整失败日志：本机 `E:VirtualAIOfficedispatchCI-FIX1-20261026main-0f851d3-CI失败日志.log`，也可以用 `gh run view 40151780656 -R leishen8806/VirtualAiOffice --log-failed` 获取。

## 失败分类（审查员已核对日志）

| 类 | 例子 | 原因 |
|---|---|---|
| A 写死本机路径 | 556、564、1068 等 | 读取 `E:/VirtualAIOffice/paperclip-ops/office3d-backup-*`（不在仓库里） |
| B 依赖本机知识库钩子 | 763、764 | 需要 `knowledge/.git/hooks/pre-commit` |
| C 测试文件放错位置 | `office3d/warehouse-shell.test.mjs`、`office3d/town-nav.test.mjs` | 文件在 office3d 根目录，却按 tests/ 子目录写的相对导入，找不到 `office-layout.js` |
| D 路径安全测试依赖平台 | 501（Linux）、512（Windows） | 盘符大小写、允许根目录按本机路径写死 |
| E 运行中被取消 | `command-view-live.test.mjs` 216–231 共 16 项 | "Promise resolution is still pending"；CI 用 Node 22，本机是 Node 25，需查是版本差异还是计时器问题 |
| F 新格局路线矩阵 | `office-v3-align-data.test.mjs`（115） | CI 上失败、本机通过，需查原因 |

## 要求

1. **A/B 类：** 这类测试只在本机证据存在时才运行，不存在时**明确跳过并写原因**（skip 原因要能在报告里看到），不得静默通过。能改用仓库内夹具的优先改用夹具。
2. **C 类：** 两个文件移到 `office3d/tests/` 并修正导入，或改正导入路径；断言不变。
3. **D 类：** 平台相关的断言按平台分支写，Windows 与 Linux 各自有正确期望，不删断言。
4. **E/F 类：** 查明根因后修复。
   - 如果是 Node 版本差异，CI 的 Node 版本要与本机对齐，或让测试两边都能过，并写明选择。
   - 不得加大超时来掩盖问题。
5. **禁止：** 删除测试、放宽断言阈值、改产品代码。如果确实需要改产品代码，先停下来报告。
6. **验收：**
   - 在新分支上，CI 两个系统（ubuntu、windows）全绿；
   - 本机全量测试结果与 main 一致（只剩已知的 2 项钩子环境项，或它们也已按第 1 条改为明确跳过）；
   - 列出所有新增跳过及原因。
7. **交付：** 分支名、完整 SHA、CI 运行链接、改动清单。停下等 Q-V1 复核，不合并。

## 分支

从 `main`（0f851d3）新建 `fix/ci-portable-tests`。
