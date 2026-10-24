# CAMPUS-PREFIX-FIX 回执

基线：`feat/v3-align-scene @ befaa45020dc83a35ae4b82413ceed3846e90be4`。

## 做到

- 修复 `campus-layout.test.mjs` 的旧源码前缀守护，使其只剥离已授权的 V3-F1 与 V3-A1/R2 追加内容。
- 将既有 `v3Block` 收窄到旧 V3 数据边界，并新增独立 `alignBlock`，只剥离 `alignRect` 至 `LAYOUT_V1_DATA` 之间的 ALIGN 数据块。
- 显式剥离并断言存在以下授权增量：
  - V3-F1 的 V3 `regionFocus.meet` 条目；
  - `regionFocusOf` 导出；
  - `LAYOUT_V3_ALIGN` 导出；
  - ALIGN 数据块（其中包含 R2 批准的 `sofaOuter: 5.45`）。
- 原有 `resolverBlock`、`barBlock`、V1/V2 导出值比较和前缀逐字 `startsWith` 守卫保持不变；未改产品代码或布局数据。

## 变异证明

每次变异均在临时工作副本中执行测试后恢复：

| 变异 | 结果 |
| --- | --- |
| `LAYOUT_V1_DATA` 内 `ENVELOPE, MAIN_FLOOR_X0` 改为 `ENVELOPE,  MAIN_FLOOR_X0` | 失败：`all pre-S2-3 exports keep values and source prefix`，`false !== true`。 |
| V2 `market` 的 x0 从 `-34` 改为 `-33` | 失败：`all pre-S2-3 exports keep values and source prefix`，`false !== true`。 |
| 在 `regionFocusOf` 导出行尾添加临时注释 | 通过：`8/8`。 |

这证明 `LAYOUT_V1_DATA` 与 V2 的旧源码仍逐字守护，而已授权的 `regionFocusOf` 行被正确放行。

## 测试

定向：

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/campus-layout.test.mjs
tests 8
pass 8
fail 0
```

任务要求的完整命令：

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/campus-layout.test.mjs tests/office-*.test.mjs
```

| 对象 | 结果 |
| --- | --- |
| 修复后分支 | `203` tests，`199` pass，`4` fail |
| `befaa45` 基线 | `203` tests，`198` pass，`5` fail |

修复后少了且只少了目标失败 `all pre-S2-3 exports keep values and source prefix`。两边共有的 4 个失败均为隔离 worktree 缺失历史备份夹具：

```text
O4 app wiring stays within its own 20-line budget and layout1 data is identical
tests/office-layout-v2.test.mjs
O6O7 production wiring contains no business, network, warehouse or wall-clock reads
O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines
```

## 改动文件

- `office3d/tests/campus-layout.test.mjs`
- `dispatch/trae/outbox/CAMPUS-PREFIX-FIX-report.md`

## 没做到

- 无。

## 未验证

- 未修改页面或产品运行时模块；未进行浏览器验收。
