# V3-A1 补充说明：吧台岛字段名（必读）

适用于 `V3-A1-align-layout-data.md`。

`LAYOUT_V3` 已有：

```
island: { center, radius: 6, diameter: 12, treeRadius: 1.2, barOuter: 3.5, stoolRadius: 4.2, sofaOuter: 5.8 }
bar:    { center, radius: 3.5, seats: [...], gaps: [{ side: 'east', width: 1.5 }, { side: 'west', width: 1.5 }] }
```

在 `LAYOUT_V3_ALIGN` 中：

- **沿用上述字段名**，不要改用方案 JSON 里的 `counterRadius / collisionRadius / sofaRadius` 等新名字；
- 方案甲的"碰撞外沿 6"写在 `bar.radius: 6`；服务台台面保持 `island.barOuter: 3.5`；吧凳 / 沙发保持 `island.stoolRadius: 4.2`、`island.sofaOuter: 5.8`；环路 `6..10` 可新增 `island.ring: { inner: 6, outer: 10 }`；
- 原因：Codex 的吧台样板正在把"服务台半径"（读 `island.barOuter`）与"碰撞半径"（读 `bar.radius`）分开读取（卡 V3-A2P）。若字段名不一致，第 2 步接线时服务台会被画成直径 12 m。

方案文档与 JSON 中的字段名请一并改为与代码一致（或在 JSON 中注明映射）。
