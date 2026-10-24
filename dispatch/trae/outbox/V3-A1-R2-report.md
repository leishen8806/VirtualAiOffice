# V3-A1-R2 回执

基线：`feat/v3-align @ f0f4632b0a4f77350fd87a66df5e10ef62f63d5b`。

## 做到

- `LAYOUT_V3_ALIGN.island.sofaOuter` 从 `5.8` 调整为 `5.45`。
- 稳定 `LAYOUT_V3.island.sofaOuter` 保持 `5.8`；`bar.radius=6`、`barOuter=3.5`、`stoolRadius=4.2` 和环路 `6..10` 均未改变。
- 新增靠背外沿约束：`5.45 + 0.35 <= bar.radius`。
- 同步更新方案 JSON、说明和 SVG 沙发环；检查器将该项作为董事会批准的唯一岛台允许差异输出。

## 改动行

| 文件 | 改动 |
| --- | --- |
| `office3d/office-layout.js` | ALIGN 的 `island.sofaOuter: 5.45`。 |
| `office3d/tests/office-v3-align-data.test.mjs` | 断言 ALIGN 为 `5.45`、稳定 V3 为 `5.8`，并验证靠背不越过碰撞外沿。 |
| `office3d/docs/v3-layout-align-plan.{json,md,svg}` | 同步沙发中心半径和差异说明。 |
| `office3d/docs/v3-layout-align-check.mjs` | 允许并打印 `5.8 -> 5.45` 的董事会裁决；其他岛台字段仍逐项比对。 |

## 检查输出

```text
允许差异：island.sofaOuter 5.8 → 5.45（董事会裁决）
V3 align plan matches runtime and approved 83ecc1b coordinates
```

## 测试

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-data.test.mjs tests/office-v3-meeting-navigation.test.mjs tests/office-v3-region-focus.test.mjs tests/office-layout-v3.test.mjs
tests 26
pass 26
fail 0
```

`office-layout.js` 相对 `f0f4632` 的唯一运行时数据改动为 ALIGN 的 `island.sofaOuter`；`LAYOUT_V1`、`LAYOUT_V2` 与稳定 `LAYOUT_V3` 未变。

## 没做到

- 无。

## 未验证

- 未修改页面入口或渲染模块；未进行浏览器 UI 验收。
