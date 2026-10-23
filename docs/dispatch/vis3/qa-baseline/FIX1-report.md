# VIS3-TEST-001-FIX1 修复报告（中文）

- 被评审提交：`eec5ea6db38f149d485c13a58cee0ed40110e133`（评审结论 CHANGES_REQUIRED）
- 修复分支：`qa/vis3-test-infra`（增量提交，未改产品应用代码）
- 基线：`main` @ `2f022fe6e9bc…`（office/dashboard）、`integration/vis2-dr-rc1` @ `e988a864b180…`（dr）

## T-01 ~ T-12 处置

| 项 | 处置 | 说明 |
|---|---|---|
| T-01 文件系统隔离 | **修复** | `scripts/vis3/fixture.mjs` 不再写/删目标仓库；总是 `fs.cpSync(office3d)` 到 `os.tmpdir()` 自建目录，再注入假配置；启动前校验绝对路径与 `office3d/server.mjs`；`stop()` 只清理自建目录。修复后目标仓库测试前后 `git status --porcelain` 逐字节一致 |
| T-02 可靠退出码 | **修复** | `run.mjs` 显式 `process.exit`：0 全过 / 1 强制失败 / 2 基础设施或未执行；强制检查计数 `mandatory{pass,fail,total}` 写入 report.json |
| T-03 真实生命周期 | **修复** | 等待 scene 真实就绪（renderer + 场景根）；office 用**同一页面** `#enter/#exit` 10 轮；dr 用同一 `page.goto` 复用同一 page（非新建 context）；新增重复 RAF 循环检测（`raf Δ < 100/s`），突变注入额外 RAF 后检测为失败 |
| T-04 跨平台执行 | **修复** | `--import` 用 `pathToFileURL(...).href`；运动断言改为确定性 `?campusMotion=0` 静止（墙钟运动仅观察，不计强制）；记录 seed/时钟/相机条件 |
| T-05 网络隔离 | **修复** | 浏览器侧按**精确 origin+端口**允许清单（仅测试服务器端口）；其它 localhost 端口（含 3100/3200）与外部一律在传输前 `route.abort()`；服务端 preload 端口白名单 fail-closed；未授权端口 POST 突变：目标服务器 **0 命中** |
| T-06 场景运行时异常 | **修复** | 每个场景收集 `pageerror`+`console.error`，强制 `no-runtime-errors` 检查；突变抛错被捕获并判失败 |
| T-07 动态对象属性/透明材质 | **修复** | dr 强制校验 `vis2-rack-film` opacity≈0.28 且 `dynamic=true`、`vis2-shuttle` dynamic 与 lift 组结构 |
| T-08 就绪超时判失败 | **修复** | `waitReady` 超时返回 false → `*-ready` 强制检查失败 |
| T-09 从导航起点测加载 | **修复** | `performance.getEntriesByType('navigation')[0].loadEventEnd - fetchStart` |
| T-10 真实性能/软渲染识别/禁用态 | **修复** | office 补真实帧采样与 renderer 计数；`gpu.renderer` 含 SwiftShader/llvmpipe/software 时标 `softwareRenderer:true`（不宣称 GPU PASS）；禁用态与启用态分开：flags off 时 `/?campus=1` 无 campus、office flag false 无 officeV2（见基线矩阵） |
| T-11 结构化报告 | **修复** | `report.json` 由实际测试输出生成，含 SHA、强制计数、逐场景 checks |
| T-12 大文件/复现脚本 | **修复** | 截图/日志写入 `--out`（本次不提交二进制到仓库）；复现脚本 `scripts/vis3/selfcheck.mjs` + `run.mjs` 入库 |

## 测试命令与结果

```bash
# 办公室 + 桌面看板（main）
VIS3_PLAYWRIGHT=/path/to/playwright node scripts/vis3/run.mjs --repo . --scene office,dashboard --out /tmp/vis3/fix-final/main
# DR 仓配（RC1 工作树）
VIS3_PLAYWRIGHT=/path/to/playwright node scripts/vis3/run.mjs --repo <rc1 worktree> --scene dr --out /tmp/vis3/fix-final/dr
# 突变自检
node scripts/vis3/selfcheck.mjs
```

| 运行 | 退出码 | 强制检查 | 结果 |
|---|---|---|---|
| office+dashboard（main） | 0 | 12/12 | PASS |
| dr（RC1） | 0 | 11/11 | PASS |

## 突变自检结果

| 突变 | 退出码 | 检测到的失败检查 | 预期 |
|---|---|---|---|
| 重复 RAF 循环 | 1 | `office-no-duplicate-loop`（raf Δ=251/s） | 检出 ✓ |
| 运行时抛错 | 1 | `office-no-runtime-errors-2`（pageerror `VIS3_MUT_RUNTIME`） | 检出 ✓ |
| 未授权端口 POST（127.0.0.1:3199） | 1 | 网络阻断 + 页面 ERR_FAILED；3199 服务器 **0 命中** | 传输前阻断 ✓ |

## 隔离证明

- 文件系统：修复后目标仓库测试前后 `git status --porcelain` 一致；DR 工作树历史残留（旧版 runner 造成的 `campus-visual.json/office-visual.json` 改动与 `company-id.txt`）已恢复干净。
- 网络：mock 写请求 0；浏览器外部请求 0；`blocked-network.jsonl` 仅天气 API 阻断；未授权 localhost 端口在传输前被 `route.abort` 阻断。

## 仍待外部条件验证（未自批）

- 目标 GPU（Windows RTX 等）与 4K/60fps：本机 Apple ANGLE Metal，仅本机实测。
- 其它浏览器（Firefox/Safari）与 Windows 执行。
- 视觉符合参考图：无 office/campus 参考包，视觉 REVIEW_REQUIRED。
- 四席中控 / DR 接待 / 品牌：RC1 门禁排除 B/B1，未含这些对象。
- 办公室样板与桌面看板走 `main`；DR 走 `integration/vis2-dr-rc1`，二者 SHA 已在报告记录。

## 复审请求

本修复为 `qa/vis3-test-infra` 的增量提交，仅新增/修改 `scripts/vis3/*` 与 `docs/dispatch/vis3/qa-baseline/FIX1-report.md`，未改产品应用代码、未合并 main、未部署。请 Claude Opus 5.5 独立复审；不自我批准上线。
