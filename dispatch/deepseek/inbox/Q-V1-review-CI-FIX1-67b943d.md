# Q-V1 复审报告 · CI-FIX1（harness，2026-10-26）

- 候选：`fix/ci-portable-tests` @ `67b943d`（5 个提交）
- 最新 CI：运行 40285321959；ubuntu 通过，**windows 失败 1 项**
- 回执：**未交**（PROCESS-1 要求）
- 方式：只读；在本机 Windows 上复现了失败项

## 结论

**未通过，需返修（CI-FIX1-R3）。** 方向正确，已完成大部分；剩下 1 项 Windows 失败、追加的 A7 / A8 未做、回执未交。

## 已做好

- **A 类（本机路径）：** 改为"本机证据不存在时明确跳过并写原因"。涉及 pedestrian-stress 的 legacy 对比、hook 集成测试、memory 等，跳过原因都写在测试里。
- **B 类（钩子依赖）：** 同上处理。
- **C 类（放错位置的测试）：** 删掉了 `office3d/town-nav.test.mjs` 和 `office3d/warehouse-shell.test.mjs` 两个根目录副本。核对确认 main 中 `office3d/tests/` 下早有同名测试，且为更完整的版本（town-nav 8 个测试 vs 7 个；warehouse-shell 4 个 vs 4 个），覆盖没有减少。
- **D 类（路径安全）：** 按平台分支写，Windows 保留盘符大小写、反斜杠、前缀混淆、`..` 逃逸；Linux 用等价的 POSIX 语义。没有删断言。
- **E 类（command-view-live 被取消）：** 给挂起的 mock 加了一个保持事件循环存活的计时器（Node 22 上 AbortSignal 的计时器不保持事件循环）。原因说明合理。
- **ubuntu：** 全部通过。

## 未通过

1. **Windows #512「sha256 一致 / 已变 / 缺失」仍失败。** 审查员在本机复现并定位了原因：
   - `evidence-version.mjs` 的 `realOrResolve()` 对存在的文件用 `fs.realpathSync.native`，会把 Windows 8.3 短名（如 `RUNNER~1`）展开成长名；对**不存在**的文件则退回 `path.resolve()`，**不展开**短名。
   - 测试的 `tmp()` 用的是 `fs.realpathSync`（JS 版），也不展开短名。
   - 结果：CMP-3（缺失文件）的路径带短名，允许根目录却是长名，于是被判为"路径不在允许范围"，而不是"文件不存在"。本机 E 盘没有短名，所以本机通过、CI 失败。
   - **测试修法（不改产品代码）：** `tmp()` 改用 `fs.realpathSync.native`，让测试中的根目录本身就是长名。
   - **产品层面的发现：** 在短名路径下，"文件不存在"会被误报成"路径不在允许范围"。修复需要改 `realOrResolve()`：对不存在的路径，先用 native 规范化最近的已存在祖先目录，再拼回剩余部分。这属于产品代码，按卡片规定**先报告，不在本卡改**，由董事会决定是否另开小卡。
2. **追加修订 R2 的 A7 / A8 未做。** 没有看到"没跑 / 旧报告 / 解析失败不能算通过"和"只清理本次创建目录"的负向测试。
3. **未交回执。** 请按 `dispatch/_TEMPLATES/2-交付回执.md` 写，逐条列出所有新增跳过及原因。
4. **CI 文件里的临时改动：**
   - `push` 触发分支加了 `fix/ci-portable-tests`，这是调试用的，合并前要删掉（改用 PR 触发）；
   - `test:all` 拆成了 3 步，请在回执中说明三步合起来与原 `test:all` 覆盖相同；
   - Step summary 的标题写死为 "Windows unit-test failures"，ubuntu 也会用到，请改成通用标题。
