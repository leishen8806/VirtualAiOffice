# DS-2 汇报：`office3d/town-names.js` 名称表完整性测试

- 状态：**待验收**
- 分支：`ds/DS-2-town-names-tests`
- 基线：`office3d/rev-20261022` @ `eab61eb0b8aa6ff80084ac637489d6dd0d9f569b`
- PR：**未开**（本机没有 `gh` / GitHub token；按卡片「或把分支名告诉派发人」交付分支名，见文末）
- 卡片：`dispatch/deepseek/inbox/DS-2-town-names-tests.md`

## 做到

新增 `office3d/tests/town-names-completeness.test.mjs`（103 行，8 个 test，43 处 `assert` 调用点，执行时循环内断言 >60 个点），只加测试、不改被测代码。

覆盖卡片要求：

1. `LABEL_MODES` 恰为 `['zh','en','km']`，已冻结、不可扩展；`DEFAULT_LABEL_MODE` 是非空字符串且属于 `LABEL_MODES`。
2. `KHAN_NAME_MAP` 恰 14 项；键唯一、都以 `Khan ` 开头、无首尾空格；每项 `zh` / `en` 均非空字符串且无首尾空格；**`zh` 值互不重复、`en` 值互不重复**；名称表与每个子对象都已冻结。
3. `LANDMARK_NAME_MAP` 已冻结；键无首尾空格；所有值都是非空、无首尾空格的字符串。
4. 导出函数回退：当前 `town-names.js` **没有函数导出**，用例显式记录这一点；若将来新增函数，循环会自动对 `''` / `__missing__` / `Khan Missing` / `Not A Landmark` 检查「不抛错、不返回 undefined/null/空串」。
5. 不可变性：命名空间导出赋值、子对象改值、新增键、删除键、地标改值、`LABEL_MODES.push` 均按当前严格模式行为抛 `TypeError`，并断言拒绝后原值未变。

与既有 `tests/town-map-polish.test.mjs` 的分工：那边校验「名称表键与地图数据一致、无控制字符」；本卡补的是**冻结、唯一性、前缀、回退与不可变性**，未重复其断言。

## 验证证据

验收命令（与卡片一致）：

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/town-names-completeness.test.mjs
```

真实输出末尾：

```
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 39.451375
```

## 变异自检

按卡片把 `town-names.js` 复制到系统临时目录（`.mjs` 扩展名），把 `甘布区` 改成与另一项重复的 `七市区`，用 `TOWN_NAMES_MODULE` 指向副本运行：

```
mutation exit=1
# tests 8
# pass 6
# fail 2
not ok 4 - 每个可汗区都有非空且互不重复的 zh / en
  error: zh 值互不重复
  13 !== 14
not ok 8 - 导出对象不可被修改：赋值与增删键都按当前行为被拒绝
  （原值断言同样变红）
```

随后删除副本，`git diff --stat office3d/town-names.js` 为空，再跑验收命令恢复 8/8 通过。

## 没做到

- 未开 PR、未转 Ready：本机无 `gh` 与 GitHub token，只有 SSH 推送权限。分支已推送，分支名 `ds/DS-2-town-names-tests`，目标 `office3d/rev-20261022`。
- 未推 `main`、未 force、未合并。

## 未验证

- 董事会本机独立验收（按协议，自报「通过」不算）。
- 未读取 `town-map-data.js` 做交叉校验（避免与 `town-map-polish.test.mjs` 重复，也避免把测试绑到地图数据上）。
- 未覆盖中文/英文以外的 `km` 标签内容——`town-names.js` 目前没有 km 名称表。
- 未验证真实地图渲染中名称的显示效果（本卡为纯数据测试）。

## 范围外发现（只报告，未修复）

1. `LANDMARK_NAME_MAP['Phnom Penh']` 映射为「金边火车站」，`Phnom Penh` 本身是城市名；疑似键名或译名错位，建议董事会确认。
2. `LANDMARK_NAME_MAP` 里同时存在 `National Olympic Stadium` / `Olympic Stadium` / `Old Stadium` 三个相近条目，是否都对应真实地标需董事会确认。
3. `KHAN_NAME_MAP` 中文名为手工整理（源码首行注释也写明「待董事会确认」），本测试只保证唯一/非空/格式，不保证译名准确。
4. `town-names.js` 没有函数导出，卡片要求的「未知键回退」当前无可测对象；已在用例中留好通用检查，新增函数后自动生效。

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/tests/town-names-completeness.test.mjs` | 新增，103 行 |
| `dispatch/deepseek/outbox/DS-2-report.md` | 新增（本报告） |

`office3d/town-names.js`、`server.mjs`、`app.js`、`ui.js`、`index.html` 均未改动。
