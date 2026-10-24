---
id: DS-2
base: office3d/rev-20261022
branch: ds/DS-2-town-names-tests
scope:
  - office3d/tests/town-names-completeness.test.mjs
budget: 1h
---
# DS-2：为 `office3d/town-names.js` 补名称表完整性测试（只加测试，不改被测代码）

`town-names.js` 导出 `DEFAULT_LABEL_MODE`、`LABEL_MODES`、`KHAN_NAME_MAP`、`LANDMARK_NAME_MAP`（以及可能的函数，先读源码确认）。已有 `tests/town-map.test.mjs`、`tests/town-map-polish.test.mjs` 引用它，先读它们，不重复已有断言。

## 要做的事
1. 新建 `office3d/tests/town-names-completeness.test.mjs`（`node:test` + `node:assert/strict`，风格参考同目录其它测试）。
2. 覆盖：
   - `LABEL_MODES` 恰为 `zh`、`en`、`km` 且已冻结；`DEFAULT_LABEL_MODE` 属于它；
   - `KHAN_NAME_MAP` 共 14 项，每项都有非空的 `zh` 与 `en`；`zh` 值互不重复、`en` 值互不重复；对象（含每个子对象）均已冻结；键都以 `Khan ` 开头；
   - `LANDMARK_NAME_MAP` 所有值为非空字符串，键无首尾空格，对象已冻结；
   - 模块导出的任何函数（若有）对未知键的回退：不抛错、不返回 `undefined` / `null` / 空串；
   - 不修改任何导出对象（尝试赋值应无效或抛错，用断言固定当前行为）。
3. 至少 10 个断言点。只新增 `scope` 里的一个文件；**不改 `town-names.js` 或其它文件**。发现的问题只写进报告的「范围外发现」，不修。

## 验收标准（在干净的仓库副本里运行）
```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/town-names-completeness.test.mjs
```
- 全部通过。
- 变异自检：把 `town-names.js` 复制到系统临时目录的新文件夹（`.mjs` 扩展名），把其中一个中文名改成与另一个相同，或删掉一项，让测试指向副本跑，对应测试必须变红；然后删除副本；`git diff` 里 `town-names.js` 无改动。报告里贴变红输出末尾。

## 不做的事
不安装依赖、不联网、不下载素材；不碰 `app.js / ui.js / index.html / server.mjs`；不推 `main`、不 force；不在报告里写任何密钥、IP、本机路径或账号。

## 交付
- 分支 `ds/DS-2-town-names-tests`，推送后开 PR（或把分支名告诉派发人），目标 `office3d/rev-20261022`。
- 同一分支新增 `dispatch/deepseek/outbox/DS-2-report.md`：做到 / 没做到 / 未验证；改动文件与行数；测试命令与输出末尾；变异自检输出；范围外发现。
- 完成后停下，等待规划者验收。
