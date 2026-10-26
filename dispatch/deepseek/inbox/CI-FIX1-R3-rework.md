# CI-FIX1 · 修订 R3：返修

```text
卡号：CI-FIX1          修订：R3（R1 原卡、R2 追加 A7/A8、R3 本次复审返修）
派单号：CI-FIX1-R3-01
需求文件：dispatch/deepseek/inbox/CI-FIX1-portable-tests.md、CI-FIX1-ADDENDUM-R2-not-run-and-cleanup.md、本文件、Q-V1-review-CI-FIX1-67b943d.md
代码基线：fix/ci-portable-tests @ 67b943d（在同一分支继续）
执行方：harness
范围：只改测试、CI 配置；产品代码禁止改（发现产品问题先报告）
状态：ACTIVE
```

完整复审意见见同目录 `Q-V1-review-CI-FIX1-67b943d.md`。

## 验收

- **B1 Windows #512「sha256 一致 / 已变 / 缺失」。** 根因是 Windows 8.3 短名（审查员已在本机定位）：
  - `realOrResolve()` 对不存在的文件不展开短名（退回 `path.resolve`）；
  - 测试 `tmp()` 用 JS 版 `fs.realpathSync`，也不展开短名；
  - CI 机器临时目录是 `C:\Users\RUNNER~1\...`，因此缺失文件被判为"路径不在允许范围"。

  修法：测试 `tmp()` 改用 `fs.realpathSync.native`。**不改产品代码**，产品层的误报写进回执，交董事会决定。
- **B2 补做 R2 的 A7 / A8，各配负向测试。**
  - A7：程序没启动、旧报告残留、解析失败时，结果是 NOT_RUN / INCOMPLETE，不得算通过；
  - A8：存在同名前缀、但不属于本次运行的目录时，不被删除。
- **B3 CI 文件清理。**
  - 删掉 `push` 触发里的 `fix/ci-portable-tests`，改为开 PR 触发；
  - 在回执中说明拆分后的 3 个步骤，与原 `npm run test:all` 覆盖完全相同；
  - Step summary 标题改成通用的，不要写死 "Windows"。
- **B4 少推送。** 本仓库公开，Actions 不计额度；但请尽量在本地复现后再推，不要靠反复推送来试。
- **B5 交付回执。** 按 `dispatch/_TEMPLATES/2-交付回执.md` 写，放到 `dispatch/deepseek/outbox/CI-FIX1-交付-R3.md`：
  - 逐条写 A1–A8、B1–B5 的结果；
  - 列出所有新增跳过及原因；
  - 附 ubuntu、windows 都通过的 CI 运行链接。

## 交付

推送后交完整 SHA 和回执，停下等 Q-V1 复核，不合并。
