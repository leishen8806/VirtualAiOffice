# 地点 URL 命名

地点入口统一使用：

```text
?place=<tenant>-<kind>
```

当前只注册租户 `drlife`。`kind` 仅允许：

| 地点 | 规范 URL | 兼容旧值 |
|---|---|---|
| 智序工场·办公室 | `/?place=drlife-office` | `/?place=office` |
| WH-R1 仓配服务中心 | `/?place=drlife-warehouse` | `/?place=dr` |

`?place=drlife-warehouse`、`?place=dr`、`?campus=1` 与 `?controlRoom=1` 默认展示 WH-R1；显式追加 `legacy=drcampus` 可在一个验收周期内返回归档的 DR-PLAN-1 / B-R1 场景。`whr1=1` 同期保留为 WH-R1 别名。未知租户、未知类型、非法字符、大小写异常或重复 `place` 参数均回退默认办公室。

## 最新版本通道

从小镇或其它地点进入时，统一使用 `place-mode.js` 的冻结常量 `PLACE_LATEST` 和 `latestSearch(placeId)`：

| 地点 | 最新通道 |
|---|---|
| 智序工场·办公室 | `/?place=drlife-office&layout=3&align=1&officeSample=1` |
| WH-R1 仓配服务中心 | `/?place=drlife-warehouse` |

2026-10-27，按董事会“更新的版本全部展示”要求，办公室最新通道切到新办公室样板；入口页显示中性副标题「最新版 · 办公室样板」，不把随阶段变化的 L2/L2B 写死。稳定 V3 仍可直接通过 `?place=drlife-office&layout=3` 访问。

仓配最新通道 = WH-R1；URL 保持 `?place=drlife-warehouse` 不变。归档旧场景仅通过 `?place=drlife-warehouse&legacy=drcampus` 访问。

最新通道仅用于导航入口。默认页面 `/` 与直接输入 `/?place=drlife-office` 仍为布局 1；`?layout=2` 行为不变。稳定 V3 仍可直接使用 `?place=drlife-office&layout=3`。以后切换展示版本，只修改 `PLACE_LATEST`。

`resolvePlaceMode()` 保留现有 `place` 值（`office` 或 `dr`），并返回：

- `placeId`：规范地点 ID。
- `tenant`：当前为 `drlife`。
- `kind`：`office` 或 `warehouse`。
- `legacy`：是否通过旧格式或默认入口解析。
- `layout`：办公室如实返回 URL 中合法的 `1`、`2` 或 `3`，缺省或非法时为 `1`；仓配为 `null`。

地图 API 的地标 ID 保持 `office-zixu-workshop` 和 `dr-logistics-campus`，浏览器通过 `town-map-core.js` 映射到规范地点 ID。

镜头键规范为 `office3d.camera.<placeId>`。仓配读取顺序为：

```text
office3d.camera.drlife-warehouse
office3d.camera.dr
```

第二项仅用于一次旧数据兼容。实际读写钩子仍位于 `app.js`，需在其持有会话中接入 `cameraStorageKeys()`。
