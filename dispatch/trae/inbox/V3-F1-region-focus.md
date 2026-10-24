---
id: V3-F1
base: main @ b2803c92db8d58a921e4753618ad5ca146de7816
branch: fix/v3-region-focus
scope:
  - office3d/app.js
  - office3d/office-layout.js
  - office3d/tests/office-v3-region-focus.test.mjs
  - dispatch/trae/outbox/V3-F1-report.md
budget: 2h
---
# V3-F1：`?layout=3` 下分区机位与工具栏按钮指向楼外（小卡）

从 `main` 新建分支 `fix/v3-region-focus`。该问题在 `main` 上就存在，Codex 的整楼分支 `integration/office-evidence-20261023` 中 `app.js` 第 44 行与 main 相同；本卡在 main 上修，集成时再合入整楼分支。只改 `app.js` 中与机位焦点有关的行，不碰其它逻辑。

## 现象（Q-V1 视觉验收实测）

`?layout=3` 下，大屏 `wallGo(机位)` 与底部工具栏分区按钮共用同一套焦点。以下机位画面大半是楼外空地（近白像素占比，总览参照 0.27–0.29；样板开 / 关结果一致）：

| 机位 | 空地占比 |
|---|---|
| plan | 0.89–0.92 |
| review | 0.89–0.91 |
| meet（会议室） | 0.71–0.74 |
| kb（知识库） | 0.50–0.55 |
| ops（运维） | 0.34–0.36 |

## 原因

- `app.js:44`：`focus: OFFICE_LAYOUT.version === 2 ? OFFICE_LAYOUT.regionFocus[id] || REGION_FOCUS[id] : REGION_FOCUS[id]`，V3（`version === 3`）落到 V1 的 `REGION_FOCUS`；
- `LAYOUT_V3.regionFocus` **已经存在**（`office-layout.js` 约第 443 行，按 V3 房间 id 生成，另有 `foyer`、`plaza`），只是没被使用；
- 另有几处直接用 V1 的 `REGION_FOCUS`：`app.js:1714`（小地图广场标签）、`:1768`（"DR 广场"按钮）、`:2174`（`WALL_SPOTS` 的 review / plan / plaza）；`:290`、`:589` 是 V1 西翼陈设，确认在 V3 下不执行即可，不要改动其行为。

## 要做

1. `app.js:44` 改为 `version >= 2` 时优先使用布局自带的 `regionFocus`，缺失才回退 `REGION_FOCUS`。
2. 工具栏分区 id 与 V3 房间 id 不完全一致：`meet` 在 V3 没有同名房间。在 `LAYOUT_V3.regionFocus` 中补一个 `meet` 别名（指向 V3 的会议区域，建议 `review` 评审室 A，或 `review` 与 `plan` 两间的合并范围），并在报告中写明选择。其余 7 个分区（product、eng、quality、drlife、ops、kb、board）确认在 V3 中都有对应。
3. `:1714`、`:1768`、`:2174` 改为同样的"布局优先、V1 回退"取值（可抽一个小函数 `focusOf(id)`）。
4. 新测试 `tests/office-v3-region-focus.test.mjs`：
   - 对 `LAYOUT_V3`，工具栏 8 个分区 id 及 `review`、`plan`、`plaza`、`foyer` 都能取到焦点；
   - 每个焦点的 `t` 落在 V3 外壳内（`site` 范围；`plaza` 落在广场圆内）；
   - V1、V2 的取值与改动前逐个相同（防回归）；
   - 测试应在旧代码上失败、在新代码上通过（报告附两次输出）。

## 不做

不改布局数据、工位、导航、家具、业务映射；不改样板与仓配；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送分支后把完整 SHA 告诉派发人；报告 `dispatch/trae/outbox/V3-F1-report.md`（放工作分支）：改动逐行清单、`meet` 的映射选择、测试两次输出。
- 若内存允许，附 `?layout=3` 下 12 个机位（overview、review、plan、plaza、product、eng、quality、drlife、ops、kb、meet、board）截图；不允许时写 NOT_RUN。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-region-focus.test.mjs tests/office-*.test.mjs`。
- 完成后停下，等待 Q-V1 复审。
