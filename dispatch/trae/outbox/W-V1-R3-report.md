# W-V1-R3 月台门号、叉车与护栏修正报告

基线：`integration/vis2-dr-rc1 @ 656f473763e0fb534f2bec7b8ff482c6492d45ea`。

## 做到

- 从车辆侧观察时，将门号七段几何整体按 X 镜像：01 的个位 `1` 位于观察者右侧，02 的 `2` 不再镜像为 S。
- 将叉车货叉前移，货叉后端不再进入车身体积；四个叉车车轮外移，至少半个宽度投影露出车身。
- 将护栏移至 02 号月台调节板东端外，消除调节板与护栏立柱穿插。
- 预览页增加固定机位按钮：全景、月台近景、车辆侧面；顶栏保留“候选静态预览，非部署”。

## 旧提交断言验证

将新增测试复制到隔离的 `c03540a` 工作树后执行：

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/dr-vis2-dock-sample.test.mjs
```

旧提交结果为 8 项中 4 项失败，新增守卫全部被捕获：

| 守卫 | 旧代码结果 | 新代码结果 |
| --- | --- | --- |
| 门号观察方向 | FAILED：02 号门 `2` 镜像 | PASS |
| 货叉与车身 | FAILED：`true !== false` | PASS |
| 叉车轮外露 | FAILED：车轮未露出半宽 | PASS |
| 02 调节板与护栏 | FAILED：护栏 0 穿插 | PASS |

当前定向结果：`8/8` 通过。

## 静态预览

在独立 Playwright 上下文通过 `route.fulfill` 从候选工作树读取静态文件，未启动服务：

- 映射文件：10 个，均有 SHA-256 记录。
- 未映射请求：0；控制台 / 页面错误：0。
- 固定机位：全景、月台近景、车辆侧面。
- 月台模块：`10 calls / 1044 triangles`。
- 合成预览帧间隔：`16.66–16.67ms`。

证据位于 `review-artifacts/VIS-ALIGN-20261023/W-V1-R3-月台静态预览/`，标注为候选静态预览，非部署。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `office3d/dr-vis2-dock-sample.js` | 镜像门号、前移货叉、外移叉车轮、东移护栏。 |
| `office3d/dr-vis2-dock-sample-preview.html` | 添加三个固定机位按钮。 |
| `office3d/tests/dr-vis2-dock-sample.test.mjs` | 新增并拆分四项可独立失败的几何守卫。 |
| `dispatch/trae/outbox/W-V1-R3-report.md` | 记录验证、预览与范围结论。 |

## 没做到

- 未接入主场景，未修改货架、共享模块、`dr-campus-*`、办公室或中控台。
- 未部署、未启停服务、未合并 main、未 force push。

## 未验证

- 未采集真实主场景的 GPU 性能；本次证据为严格路由的候选静态预览。
