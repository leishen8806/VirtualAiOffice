---
id: OF-R3
base: integration/office-evidence-20261023 @ 345cd39f7dddebf4e4e61e146af7a283cd415088
branches:
  - integration/office-evidence-20261023（恢复提交）
  - feat/v3-align-sample（合入恢复提交）
  - feat/v3-align-scene（若已新建，合入恢复提交）
scope:
  - dispatch/codex/inbox/OF-R3-restore-files.txt 中列出的 43 个文件（只恢复，不改内容）
  - dispatch/codex/outbox/OF-R3-report.md
budget: 45min
---
# OF-R3：恢复 OF-R1 合并时丢失的 43 个 main 文件（阻断合并 main，优先处理）

## 问题

Q-V1 做合并前集成验证（main `b2803c9` + 中控台 `2d300ae` + 办公室 `9f881d0`）时发现：办公室这一支合进 main 会**删除 main 上 43 个文件**。

- 来源是 OF-R1 的合并提交 **`66bca48`**（"Merge O-06 FIX3 into office integration and correct plaza quality tiers"），两个父提交是 `1bf9ec9` 与 `0c266d5`。
- 两者的共同祖先 `eee77ac` 中没有这些文件，`0c266d5` 一侧有，按正常三方合并应当保留；但 `66bca48` 的结果里没有。`git diff 0c266d5 66bca48` 显示恰好删除这 43 个文件。
- 受影响的文件包括：
  - 办公室参考图 `docs/visuals/target-office.png` 等 6 个参考图；
  - 仓库组件 `office3d/dr-vis2-rack-cell.js`、`dr-vis2-dispatch-suite.js` 及其预览页、测试与说明；
  - 仓库 QA 证据 `docs/dispatch/vis2/qa-2879124/`；
  - DS-2～DS-6 回执。
- 完整清单：`dispatch/codex/inbox/OF-R3-restore-files.txt`，每行一个路径，共 43 行。
- 受影响分支：`integration/office-evidence-20261023`、`feat/v3-align`、`feat/v3-align-sample`，以及将要新建的 `feat/v3-align-scene`（它们都从 `66bca48` 派生）。

（OF-R1 复审时，Q-V1 比较的是 `1bf9ec9..66bca48` 的改动范围，漏报了这项删除。这次问题不记在执行者名下。）

## 要做

1. 在 `integration/office-evidence-20261023` 上从 `345cd39` 追加**一个**提交，只从 `origin/main` 恢复清单中的 43 个文件，例如：
   ```
   git checkout origin/main -- $(cat dispatch/codex/inbox/OF-R3-restore-files.txt)
   ```
   清单文件在 `dispatch/codex` 分支上，可以先用 `git show origin/dispatch/codex:dispatch/codex/inbox/OF-R3-restore-files.txt` 取出。
   - 不改任何其他文件；
   - 提交说明写明恢复原因与来源 `66bca48`。
2. 把这个恢复提交合入 `feat/v3-align-sample`（从 `3c0ffff` 继续）。如果 `feat/v3-align-scene` 已经新建，也合入；如果还没建，V3-A2 新建该分支后第一步就合入。
3. `feat/v3-align`（Trae 持有）**不要动**，由派发人另行安排。

## 验收

- `git diff --name-status origin/main <各分支>` 中，**不再出现清单里任何一项 `D`**。
- 43 个文件与 `origin/main` **逐字节相同**：`git diff origin/main <分支> -- <43 个文件>` 输出为空。
- 恢复提交只改这 43 个文件：`git show --stat` 恰为 43 个新增文件。
- 测试（带资源上限）在 `integration/office-evidence-20261023` 上运行：
  - `node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs tests/dr-vis2-dispatch-suite.test.mjs` 通过；
  - `tests/office-*.test.mjs` 失败按名称与 `345cd39` 比较，不得新增。
- 合并时如有冲突，停下并在报告中列出，不要自行取舍。

## 不做

不改这 43 个文件的内容；不改任何产品代码；不推 `main`、不 force push、不改写已有提交、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后告诉派发人各分支的完整 SHA：
  - `integration/office-evidence-20261023`；
  - `feat/v3-align-sample`；
  - `feat/v3-align-scene`（若已新建）。
- 报告 `dispatch/codex/outbox/OF-R3-report.md`：恢复提交的 `--stat`、上述验收命令的真实输出末尾、测试结果。
- 完成后停下，等待 Q-V1 复审；之后继续 V3-A2。
