# W-RC-R4 货架托盘高度守卫与清单精确匹配回执

基线：`integration/vis2-dr-rc1 @ fb652f0a0fa7e4ade56b2607186165fec1b00fcb`；对照基线：`a1df093798d2eafee908021b1495fa793d4186a8`。

## 做到

- 新增 1 项实测高度守卫：每个货位托盘面底必须贴合其 3 个托盘腿顶面；车载托盘面底必须贴合其 3 个 `pallet-bearer*` 顶面，容差为 `1e-4`。
- 将 `VIS2_REPLACES` 清单验证从名称前缀匹配收紧为 `legacyRoot.getObjectByName(legacy)` 精确匹配。
- 同步旧对象替换语义：`campus-shuttle` 是保留的宿主状态容器，只有 `campus-shuttle-static` 的轨道和枕木由 `vis2-rails` 替换。
- 同步标签说明：当前代码已显示“穿梭机展示位（模拟）”，原“需 Trae 改标签文案”待办不再成立。
- 仅修改 `dr-vis2-rack-cell.js` 的清单 note 字符串；未改任何产品几何或行为。

## 变异证明

每次变异均在独立临时 worktree 中执行后恢复。

| 变异 | R4 新测试 | `a1df093` 对照 |
| --- | --- | --- |
| X1：货位托盘面与纸箱整体上抬 `+5 cm` | 失败：`slot and shuttle pallet decks rest on their measured bearer tops` | 21/21 通过 |
| X2：车载 `loadTop` 上抬 `+5 cm` | 失败：`slot and shuttle pallet decks rest on their measured bearer tops` | 21/21 通过 |
| X5：清单 `campus-shuttle` 改为 `campus-racks` | 失败：`replacement list names an exact legacy object: campus-racks` | 21/21 通过 |

## 测试

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs
tests 22
pass 22
fail 0
```

## 改动文件

- `office3d/tests/dr-vis2-rack-cell.test.mjs`
- `office3d/docs/dr-vis2-rack-cell.md`
- `office3d/dr-vis2-rack-cell.js`（仅清单 note 字符串）
- `dispatch/trae/outbox/W-RC-R4-report.md`

## 没做到

- 无。

## 未验证

- 未改页面或运行时接线，未进行浏览器、WebGL 或 GPU 验收。
