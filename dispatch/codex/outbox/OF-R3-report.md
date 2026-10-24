# OF-R3 回执：恢复合并丢失文件

## 做到

- 已读取 dispatch/codex @ 35bf19e28e47ccf3d3cc1355c9c90704f967f443 的 README、00-PRIORITY 和本卡；V3-A2 暂停在已推送的 c44047d2385a9a7e2d4c3ca836dfd277b11e9f88，未继续产品开发。
- integration/office-evidence-20261023 从规定基线 345cd39f7dddebf4e4e61e146af7a283cd415088 追加恢复提交 **e20363148819a775c8cdc66b5eb53a3d2e406bcb**。
- 来源固定为抓取后的 origin/main **b2803c92db8d58a921e4753618ad5ca146de7816**。仅恢复派单清单的43个缺失文件，包括二进制图片；不更改内容。
- 恢复提交恰好43个新增文件、3488行文本新增、0删除。此回执另作纯文档提交，不混入恢复提交。
- 已无冲突合入 feat/v3-align-sample：**ee5ae15b6adb585d8526fd9c80112a6552dcee20**（第一父提交3c0ffff）。
- 已无冲突合入现有 feat/v3-align-scene：**befaa45020dc83a35ae4b82413ceed3846e90be4**（第一父提交c44047d）。
- 两个合并相对各自第一父提交均只增加清单43项。未修改 Trae 持有的 feat/v3-align。
- 三分支清单文件的Git blob与来源完全一致，删除数均为0；工作树没有测试残留。
- 两个恢复的浏览器模块使用 stdin module 模式检查语法，均退出0。

## 一致性验收

在仓库根运行，使用派单原始清单：

```powershell
$files = @(git show origin/dispatch/codex:dispatch/codex/inbox/OF-R3-restore-files.txt | Where-Object { $_.Trim() })
git diff --name-only --diff-filter=D origin/main <branch> -- $files
git diff origin/main <branch> -- $files
```

三分支两条命令的实际输出均为空。另用 --quiet 核对退出码0，并比较合并提交文件清单：

```text
integration/office-evidence-20261023 : 43/43 blob-identical; D=0
feat/v3-align-sample : 43/43 blob-identical; D=0
feat/v3-align-scene : 43/43 blob-identical; D=0
ee5ae15b6adb585d8526fd9c80112a6552dcee20 : only 43 allowed additions
befaa45020dc83a35ae4b82413ceed3846e90be4 : only 43 allowed additions
```

## 测试与实际输出

环境：Windows，Node v25.9.0；所有测试在 integration/office-evidence-20261023 的 office3d 目录执行。先跑345cd39原基线，再恢复，避免用旧报告代替当次对照。测试为本地Three.js/Canvas替身与源文件检查，未连接生产服务。

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-rack-cell.test.mjs tests/dr-vis2-dispatch-suite.test.mjs

ℹ tests 34
ℹ suites 0
ℹ pass 34
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 605.9896
TEST_EXIT=0
```

恢复前、恢复后分别执行：

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs
```

| 版本 | 总数 | 通过 | 失败 | 取消/跳过 | 耗时ms | 退出码 |
|---|---:|---:|---:|---|---:|---:|
| 345cd39，恢复前 | 161 | 157 | 4 | 0 / 0 | 24124.4551 | 1 |
| e203631文件内容，恢复后 | 161 | 157 | 4 | 0 / 0 | 23616.727 | 1 |

恢复后真实输出末尾（统计段）：

```text
ℹ tests 161
ℹ suites 0
ℹ pass 157
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 23616.727
```

逐名称去除耗时后比较：FAILURE_SETS_IDENTICAL，新增失败0、消失失败0。四项均因检出不包含历史备份而报ENOENT，未放宽断言或补造备份：

1. O4 app wiring stays within its own 20-line budget and layout1 data is identical
2. tests/office-layout-v2.test.mjs
3. O6O7 production wiring contains no business, network, warehouse or wall-clock reads
4. O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines

```text
node --input-type=module --check < office3d/dr-vis2-rack-cell.js
node --input-type=module --check < office3d/dr-vis2-dispatch-suite.js
```

两条语法检查均无输出、退出0。

## 恢复提交 --stat

```text
 dispatch/deepseek/outbox/DS-2-report.md            |  89 +++++
 dispatch/deepseek/outbox/DS-3-report.md            | 115 ++++++
 dispatch/deepseek/outbox/DS-4-report.md            | 111 ++++++
 dispatch/deepseek/outbox/DS-5-report.md            | 139 +++++++
 dispatch/deepseek/outbox/DS-6-report.md            | 132 +++++++
 .../vis2/qa-2879124/candidate-file-sha256.txt      |   4 +
 .../vis2/qa-2879124/failure-comparison.json        | 346 ++++++++++++++++++
 docs/dispatch/vis2/qa-2879124/pixel-colors.json    |  87 +++++
 .../vis2/qa-2879124/probe-integration.json         |  59 +++
 docs/dispatch/vis2/qa-2879124/probe-node.json      | 213 +++++++++++
 .../dispatch/vis2/qa-2879124/probes/probe-node.mjs | 133 +++++++
 .../probes/probe-overlap-integration.mjs           |  64 ++++
 .../vis2/qa-2879124/probes/run-preview.mjs         | 105 ++++++
 docs/dispatch/vis2/qa-2879124/probes/side-shot.mjs |  20 ++
 docs/dispatch/vis2/qa-2879124/report.md            | 182 ++++++++++
 .../vis2/qa-2879124/screenshots/01-overview.png    | Bin 0 -> 105899 bytes
 .../vis2/qa-2879124/screenshots/02-rack.png        | Bin 0 -> 159663 bytes
 .../vis2/qa-2879124/screenshots/03-shuttle.png     | Bin 0 -> 154190 bytes
 .../vis2/qa-2879124/screenshots/04-aisle.png       | Bin 0 -> 148985 bytes
 .../qa-2879124/screenshots/canvas-beams-side.png   | Bin 0 -> 147563 bytes
 .../vis2/qa-2879124/screenshots/canvas-low.png     | Bin 0 -> 111657 bytes
 .../qa-2879124/screenshots/canvas-overview.png     | Bin 0 -> 59376 bytes
 .../vis2/qa-2879124/screenshots/canvas-pallets.png | Bin 0 -> 143693 bytes
 .../vis2/qa-2879124/screenshots/canvas-rack.png    | Bin 0 -> 101875 bytes
 .../qa-2879124/screenshots/canvas-shuttle-side.png | Bin 0 -> 81462 bytes
 .../vis2/qa-2879124/screenshots/canvas-wheels.png  | Bin 0 -> 61110 bytes
 docs/dispatch/vis2/qa-2879124/visual.json          | 252 +++++++++++++
 docs/visuals/target-dr-campus.png                  | Bin 0 -> 3401353 bytes
 docs/visuals/target-dr-dashboard.png               | Bin 0 -> 3039305 bytes
 docs/visuals/target-office.png                     | Bin 0 -> 2908307 bytes
 docs/visuals/target-setup.svg                      |   1 +
 docs/visuals/target-skin-editor.svg                |   1 +
 docs/visuals/target-skins.svg                      |   1 +
 office3d/docs/dr-vis2-asset-manifest.json          |  33 ++
 office3d/docs/dr-vis2-bb1-contract-audit.md        |  20 ++
 office3d/docs/dr-vis2-dispatch-suite.md            |  87 +++++
 office3d/docs/dr-vis2-rack-cell.md                 |  81 +++++
 office3d/dr-vis2-dispatch-suite-preview.html       |  68 ++++
 office3d/dr-vis2-dispatch-suite.js                 | 399 +++++++++++++++++++++
 office3d/dr-vis2-rack-cell-preview.html            |  60 ++++
 office3d/dr-vis2-rack-cell.js                      | 259 +++++++++++++
 office3d/tests/dr-vis2-dispatch-suite.test.mjs     | 199 ++++++++++
 office3d/tests/dr-vis2-rack-cell.test.mjs          | 228 ++++++++++++
 43 files changed, 3488 insertions(+)
```

## 没做到

没有新增测试失败；但既有四项历史备份依赖仍未解决（卡外）。未修改任何已存在产品源码、布局或业务规则；未部署、启停服务、修改 main 或 Trae 分支。恢复之外只有本回执。

## 未验证

未做浏览器、生产业务和全仓测试；本卡要求的恢复模块专项及办公室前后失败集比较已执行。恢复的历史截图只是历史证据，不充作本轮浏览器验收。

推送后由派发人核对三个完整远端SHA；本轮交付后停下等待Q-V1，不恢复V3-A2开发。
