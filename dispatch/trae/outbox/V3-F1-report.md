# V3-F1 分区机位焦点修复报告

基线：`main @ b2803c92db8d58a921e4753618ad5ca146de7816`。

## 做到

- 新增 `regionFocusOf(layout, id)`：V2/V3 优先读取布局自身 `regionFocus`，缺失时回退 V1 `REGION_FOCUS`。
- `app.js` 通过同一个 `focusOf()` 入口驱动工具栏、DR 广场按钮、小地图广场标签与 wall 模式的 `review / plan / plaza` 机位。
- `LAYOUT_V3.regionFocus.meet` 显式映射到评审室 A（`review`）：`t=[-23,0,-7.5]`、`r=18`。选择 A 是因为 V3 没有名为 meet 的独立房间，而 A 是现有会议座位和真实门洞导航合同中的 8 席会议室。
- 新增纯函数测试，覆盖 8 个工具栏 id 以及 `review`、`plan`、`plaza`、`foyer`；所有目标点在 V3 `site` 内，广场焦点在 Ø18 圆内。
- V1 每项仍取 `REGION_FOCUS`；V2 每项仍取原来的 `layout.regionFocus[id] || REGION_FOCUS[id]`。

## 旧/新输出

```text
# 新代码
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-region-focus.test.mjs
tests 3; pass 3; fail 0

# 原 main 的隔离 worktree，复制新测试后
tests 1; pass 0; fail 1
SyntaxError: ../office-layout.js does not provide an export named 'regionFocusOf'
```

旧实现没有 V3 布局优先解析函数，因此新测试不会在旧代码上误通过。

## 回归

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-region-focus.test.mjs tests/office-*.test.mjs
tests 125; pass 121; fail 4; skipped 0
```

四项失败都因隔离 worktree 缺失历史备份文件：

- `office3d-backup-o4/resume-20261021/app.js`
- `office3d-backup-o2/office-layout.js`
- `office3d-backup-o6o7/resume-20261022/app.js`
- `office3d-backup-nav-1d/app.js`

V3-F1 专项为 3/3 通过，未观察到本卡新增失败。`app.js` 和 `office-layout.js` 均已用 `node --input-type=module --check` 通过语法检查。

## 改动逐行清单

| 文件 | 改动 |
| --- | --- |
| `office3d/office-layout.js` | V3 增加 `meet` 焦点别名；导出纯函数 `regionFocusOf`。 |
| `office3d/app.js` | 使用 `focusOf()` 统一工具栏、小地图、广场与墙屏机位焦点。 |
| `office3d/tests/office-v3-region-focus.test.mjs` | 新增 V3 范围、广场圆、meet 映射及 V1/V2 回归测试。 |
| `dispatch/trae/outbox/V3-F1-report.md` | 本卡验证与范围记录。 |

备份：`office3d-backup-v3-f1/`，其中 `app.js` SHA-256 为 `702D603523924E54E78D729902DE739D7BAB4AE55821DABE038F3E4E1A998D9E`，`office-layout.js` 为 `6E27E04FC602E35F9F634A94DB48C0594922C16201BA7776DB9E3809F51AD049`。

## 未运行

- `?layout=3` 的 12 个浏览器截图：`NOT_RUN`。本卡未启动、停止或切换现有服务，无法将当前运行页可靠归属到此独立分支。

## 没做到

- 未修改布局几何、工位、导航、家具、业务映射、样板或仓配。
- 未部署、未启停服务、未合并 main、未 force push。
