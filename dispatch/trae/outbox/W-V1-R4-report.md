# W-V1-R4 月台叉车门架回执

基线：`integration/vis2-dr-rc1 @ a1df093798d2eafee908021b1495fa793d4186a8`。

## 做到

- 叉车门架从车身后半部移至车头：两根立柱位于车身前沿外，立柱后表面与车身前表面保留 `0.005m` 净空。
- 将两根独立叉齿挂到门架前表面；每根齿宽 `0.12m`、厚 `0.05m`、长 `0.9m`，后端与立柱前表面贴合。
- 门架横梁同步移至车头，且仍使用既有钢材批次。
- 叉车车轮由 `x +/-0.85` 调整到 `x +/-0.825`，内侧面贴齐车身侧面；同时保留 R3 的“至少半宽在车身外”约束。
- 叉车批次为 6 个实例（容量 8），月台模块仍为 10 次绘制调用。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `office3d/dr-vis2-dock-sample.js` | 仅更新叉车的门架、叉齿、横梁和车轮局部几何。 |
| `office3d/tests/dr-vis2-dock-sample.test.mjs` | 增加门架位置、叉齿挂接、车轮贴身及严格预算守卫。 |
| `dispatch/trae/outbox/W-V1-R4-report.md` | 本回执。 |

## 新守卫在旧基线的证明

将 R4 测试临时复制到隔离的 `a1df093` worktree 后运行：

```text
tests 10
pass 7
fail 3
```

失败名称如下，证明新守卫能捕获旧几何：

```text
W-V1-R4 forklift mast is at the front and forks attach to it
  AssertionError: mast column sits at the vehicle front

W-V1-R4 forklift forks attach to the front mast
  AssertionError: fork rear attaches to mast front

W-V1-R3 forklift wheels project outward from the body
  AssertionError: forklift wheel inner face stays within 1cm of the body side
```

## 新提交验证

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-dock-sample.test.mjs
tests 10
pass 10
fail 0
```

其中覆盖：

- 门架中心在车身前表面前方，且不与车身相交；
- 两根叉齿后端距离对应门架前表面不超过 `0.02m`，且不与车身相交；
- 四个叉车轮内侧面与车身侧面间隙不超过 `0.01m`，并至少半宽外露；
- `summary.calls === 10`，`vis2-dock-forklift` 实例数不超过 8。

## 没做到

- 无。

## 未验证

- 未启动服务或部署；未采集本次 SHA 的叉车浏览器截图。
