---
id: V3-A2-R1
base: feat/v3-align-scene @ befaa45020dc83a35ae4b82413ceed3846e90be4
branch: feat/v3-align-scene
scope:
  - office3d/office-furniture-v2.js
  - office3d/tests/office-v3-align-scene.test.mjs
  - office3d/docs/v3-align-scene.md
  - dispatch/codex/outbox/V3-A2-R1-report.md
budget: 1.5h
---
# V3-A2-R1：新格局下运维屏与书架位置、合入沙发 5.45

V3-A2（`c44047d`）与 OF-R3（`ba92f46` / `ee5ae15` / `befaa45`）都已通过 Q-V1 复审。复审报告：`review-artifacts/Q-V1/V3-A2-c44047d/`、`review-artifacts/Q-V1/OF-R3-ba92f46/`。本卡收掉 V3-A2 的 P2-1，并合入已通过的沙发裁决。

在 `feat/v3-align-scene` 上从 `befaa45` **继续追加提交**；不 force push、不推 `main`。

## 要做

1. **合入沙发 5.45**：merge `feat/v3-align` @ **`fb1e8998815dfb9b3a592266544fe4003aa4beb1`**（V3-A1-R2，已通过）。
   - 合入后 `validateIslandRings(LAYOUT_V3_ALIGN)` 应返回 `ok: true`；把实际输出写进回执；
   - 如果 `feat/v3-align` 届时已经前进（Trae 正在把 OF-R3 合进去），仍只合入 `fb1e899`，不要合入未审提交。
2. **运维屏不得落在展示室里（P2-1）**：`office-furniture-v2.js` 第 72 行写死了 `opsScreen: { x: -22.5, z: 7.2 }`，在 ALIGN 中位于 aftersales（有墙的四角展示室）内部，截图 `office-align-on-ops.png` 中"运维 · 状态见任务面板"挂在售后展示室里。
   - ALIGN 下改为由布局推导：放在 west-open 中 ops 桌组（OpsLead `(-25, -1)`、OpsEngineer `(-21.5, -1)`）附近的西墙或北缘，屏幕朝向桌组；
   - 不进入任何有墙房间，不压 `corridors` / `passages`，离工位点 ≥ 1.2 m，并登记进障碍物清单（`get('zones').obstacles()` 或同等接口）；
   - 稳定 V3 的位置保持不变（逐字节）。
3. **书架**：同一函数中 `shelves` 写死在 `x 30.5 / 32.45`，`32.45` 已超出场地东边界 32。
   - ALIGN 下改为由布局推导，放在 kb（知识，开放区）内或贴边，不超出场地、不压走廊、离工位 ≥ 1.2 m；
   - 稳定 V3 不变。

## 测试（补到 `tests/office-v3-align-scene.test.mjs`）

- 运维屏、书架在 ALIGN 下：位于场地内；不与任何有墙房间相交；不与 `corridors` / `passages` 相交；离 25 个工位点 ≥ 1.2 m。
- 运维屏中心到 OpsLead 或 OpsEngineer 的距离 ≤ 6 m。
- `validateIslandRings(LAYOUT_V3_ALIGN).ok === true`。
- 稳定 V3：运维屏与书架坐标、`office-*` 已有基线全部不变。

## 取证

`?layout=3&align=1&officeSample=1` 下的 ops 机位与总览截图（只读静态服务 + 空 `/state` 夹具，外部与非 GET 请求拦截）。

## 不做

不改 `office-layout.js`、导航、展示部门与展示人员（第 3 步由 Trae 做）；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 回执 `dispatch/codex/outbox/V3-A2-R1-report.md`：做到 / 没做到 / 未验证；`validateIslandRings` 输出；测试真实输出末尾；截图。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs`。失败按名称与 `befaa45` 比较，不得新增。
- 完成后停下，等待 Q-V1 复审。
