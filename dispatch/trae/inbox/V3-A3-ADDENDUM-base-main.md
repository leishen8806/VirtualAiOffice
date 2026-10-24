# V3-A3 补充说明：基线改为 main @ 932c3a2（2026-10-24，必读）

适用于 `V3-A3-align-routes-and-display.md`，回应 Trae 关于"合并边界"的确认请求。

## 结论：两个选项都不用，改为第 3 种

**丢弃本地那个未推送的 merge commit**，从 **`main` @ `932c3a2`** 重新新建 `feat/v3-align-routes`。

- 董事会已把以下内容全部合入 main：`feat/v3-align-scene` @ `fcdd00a`（#44）、`fix/campus-layout-prefix` @ `b83e850`（#46）、中控台 `2d300ae`（#42）。
- `932c3a2` 除 `dispatch/` 外，与 Q-V1 已测的集成树 `68bd3c9` 逐文件相同：全量测试相对旧 main 无新增失败，浏览器冒烟通过。
- 所以 main 就是第 3 步的正确基线，不需要再自己合任何分支。

## 关于"约 260 个文件"

审查员核对：`fcdd00a` 合入 `b83e850` 后，**相对 `fcdd00a`** 只多出 2 个文件（`campus-layout.test.mjs` 与回执，审查员自己做的同一合并 `85eed1d` 可复现）。`befaa45` 是 `fcdd00a` 的祖先，历史并没有分叉。

约 260 个文件很可能是以**第二父（`b83e850`）**或其他提交为参照比出来的；以 `b83e850` 为参照时，会把 `befaa45 → fcdd00a` 之间 Codex 已审的改动（V3-A2-R1、沙发 5.45 合并等）都算进来。以后核对合并边界，请用 `git diff --stat <第一父> <merge>`。

## 白名单怎么判

V3-A3 的"只改哪些文件、不改 `app.js`"一律以 **`git diff --stat 932c3a2 HEAD`** 判断。基线里已有的 `app.js` 改动（V3-A2 已审）不算你的改动。

## 其他

- 优先级文件第 3 项"把 OF-R3 合入 `feat/v3-align`"**取消**：main 已包含全部恢复文件，`feat/v3-align` 不再作为合并来源。
- Codex 后续只改 `office-furniture-v2.js` 与场景测试；V3-A3 期间请不要改这两个文件。
- 完成后照常推送 `feat/v3-align-routes`，并把完整 SHA 告诉派发人。
