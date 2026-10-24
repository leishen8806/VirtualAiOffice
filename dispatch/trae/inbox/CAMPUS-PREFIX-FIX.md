---
id: CAMPUS-PREFIX-FIX
base: feat/v3-align-scene @ befaa45020dc83a35ae4b82413ceed3846e90be4
branch: fix/campus-layout-prefix（新建）
scope:
  - office3d/tests/campus-layout.test.mjs
  - dispatch/trae/outbox/CAMPUS-PREFIX-FIX-report.md
budget: 30min
---
# CAMPUS-PREFIX-FIX：修复 campus-layout 的源码前缀守护（阻断合并 main，优先处理）

## 背景

合并前的集成验证（main `b2803c9` + 中控台 `2d300ae` + 办公室 `befaa45`）中，全量测试新增 1 项失败：`office3d/tests/campus-layout.test.mjs` 的 **"all pre-S2-3 exports keep values and source prefix"**。

这条测试逐字守护 `office-layout.js` 的旧源码前缀，只对董事会授权的改动做剥离（`v3Block`、`LAYOUT_V3` 导出行、`resolverBlock`、`barBlock`）。二分结果：`345cd39` 通过，**从 `4277ee4`（V3-F1）开始失败**，之后各版本都失败。原因是以下三处已授权的新增没有进入剥离规则：

1. V3-F1：`export const regionFocusOf = …` 导出行，以及 V3 `regionFocus` 中新增的 `['meet', …]` 一项；
2. V3-A1：`export const LAYOUT_V3_ALIGN = …` 导出行；
3. V3-A1 / R1 / R2：新格局数据块（`alignRect`、`V3_ALIGN_REGIONS`、`V3_ALIGN_SEATS`、`V3_ALIGN_DISPLAY_SEATS`、`V3_ALIGN_MEETING_SEATS`、`alignFocus`、`V3_ALIGN_LAYOUT`）。

（审查员在 V3-F1 与 V3-A1 复审时只跑了 `office-*` 定向测试，漏掉了这一项，不记在执行者名下。）

## 要做

- 从 `feat/v3-align-scene` @ `befaa45` 新建分支 `fix/campus-layout-prefix`，**只改** `office3d/tests/campus-layout.test.mjs`。Codex 正在 `feat/v3-align-scene` 上工作，不要直接往那条分支推。
- 按现有规则的写法（参照 `v3Block` / `resolverBlock`），用正则把上面三处从当前源码中剥离后再比对。
- **其余旧源码仍须逐字守护**：不得放宽为整段跳过、只比长度或只比导出名。

## 证明守护仍然有效

在临时副本中做以下变异，每次运行后恢复，在回执中贴出输出：

| 变异 | 期望 |
|---|---|
| 改动 `LAYOUT_V1_DATA` 区段里任意一个旧字符 | 该测试**失败** |
| 改动 V2 区域中任意一个旧坐标 | 该测试**失败** |
| 改动 `regionFocusOf` 那一行（已授权） | 该测试仍**通过** |

## 测试

- `node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/campus-layout.test.mjs tests/office-*.test.mjs`
- 失败名称与 `befaa45` 比较：这一项必须变为通过，不得新增其他失败。

## 不做

不改产品代码、布局数据与其他测试；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后**把完整 SHA 告诉派发人**。
- 回执 `dispatch/trae/outbox/CAMPUS-PREFIX-FIX-report.md`：改动行、变异结果表、测试真实输出末尾。
- 完成后停下，等待 Q-V1 复审。复审通过后由派发人统一开合并 PR。
