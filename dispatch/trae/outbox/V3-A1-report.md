# V3-A1 回执

实现提交：`1d2b187d8dc2b527c104fb1b67ab3d245f5e0ea8`

## 做到

- 新增冻结的独立 `LAYOUT_V3_ALIGN`；仅 `?layout=3&align=1` 选择该变体。
- 保持默认 `?layout=3` 选择既有 `LAYOUT_V3`，并将扩展公共路径节点限定在 align 变体。
- 落实 15 个区域、25 个既有角色工位、12 个展示席与 14 个会议席。
- `west-open` 为 19.5m x 10m，即 195m2；board 使用东门。
- 公共路径由布局环路、门洞、边界与 `publicPathNodes` 数据驱动。
- 增加门洞外净空、零重叠、路线连通、焦点、查询解析和稳定 V3 保护测试。
- 新增机器可读 JSON、SVG 平面图、说明和 JSON/runtime 一致性检查器。

## L3 修复映射

- `L3-01`：board 门洞固定为 east，路径测试验证入口至 board 门外点。
- `L3-02`：展示室门朝向内侧通道；所有门洞外净空至少 1.2m；入口至每个门、工位、会议席及休息席均有真实有限路线。
- `L3-03`：`v3-layout-align-plan.json` 与 `LAYOUT_V3_ALIGN` 由检查器逐项比较，SVG/Markdown 同步说明相同布局。

## 验证

通过：

```text
node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-data.test.mjs tests/office-v3-meeting-navigation.test.mjs tests/office-shared-finish.test.mjs
# 21 passed, 0 failed

node office3d/docs/v3-layout-align-check.mjs
# V3 align plan matches LAYOUT_V3_ALIGN
```

全量串行测试在实现和前置 merge 基线均为同一组 18 个既有环境失败；无新增失败。失败由隔离 worktree 缺失历史备份或本地 JSON 夹具导致，未涉及 A1 文件。

## 没做到

- 无。

## 未验证

- 未改动 `app.js` 或 `index.html`，因此未进行页面加载遮罩/浏览器 UI 验收。
