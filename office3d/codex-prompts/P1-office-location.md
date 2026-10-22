# P1-office-location：把「智序工场」的现实定位更新为 13b Ke Nou St. (9)（小卡，约 45 分钟）

**执行者：Trae（新会话）。主线 / 小镇线交界。改 `server.mjs`（互斥：排在 O2 之后；不得与别的 `server.mjs` 任务同时做）。** 先读：`_common.md`、`_lane-main.md`、`_lane-town.md`、`server.mjs` 里 `PNH` 的全部用法（天气、雷达瓦片、本地时间、事件账本时区）、`town-map-api.mjs` / `town-map.mjs` 与 `tests\town-map-api.test.mjs`、`town-map.json` 的 `coordinateSystem / layers` 结构、`town.js` / `town.html` 里画地标的方式。

**董事会 2026-10-21 指令：更新定位 —— 金边小镇 · 智序工场：`13b Ke Nou St. (9), Phnom Penh`，经纬度 `11.5536458, 104.9318027`。**（旧值 `PNH = { lat: 11.5563997, lon: 104.9282034 }` 是「独立纪念碑」定位点，与新位置约相距 0.5 km。）

**允许修改：** `server.mjs`（只改 `PNH` 的取值与注释，并按需加一个只读的位置常量导出；**逐行列出**）、新增 `office-geo.mjs`（纯常量模块：名称、地址文本、经纬度、时区、来源说明；**不含任何密钥**）、`town-map-api.mjs` / `town-map.mjs` / `town.js`（只加「智序工场」地标与标注，**不改已有图层与数据文件**）、相关测试、`README.md` 一节。备份相关文件到 `office3d-backup-p1`（**必须备份**）。**不得向 Paperclip 发请求；零 token。**

## 要做的事
1. **常量集中**：`office-geo.mjs` 导出 `OFFICE_GEO = { name:'智序工场', address:'13b Ke Nou St. (9), Phnom Penh', lat:11.5536458, lon:104.9318027, tz:'Asia/Phnom_Penh', note:'董事会 2026-10-21 指定的现实定位（示意用，非测绘精度）' }`（冻结）。`server.mjs` 的 `PNH` 改为取自它（`{ lat, lon, tz }` 的形状**保持不变**，下游 `pnhIso / 天气 / 雷达 / 账本时区` 一律不改）。
2. **天气与雷达**：切换后天气请求、雷达瓦片计算（`fx / fy`）与 `weather.location` 使用新坐标；**用单元测试固定：新坐标算出的瓦片行列号、`location` 字段、请求 URL 中的 `latitude/longitude`**；失败 / 超时行为不变（沿用现有降级）。
3. **小镇 2D 地图**：在 `/town/map` 数据或前端层面，为「智序工场」标一个**地标**（名称「智序工场」+ 地址 + 示意说明），位置由 `OFFICE_GEO` 经**现有投影函数**（`local equirectangular`，原点 `{lat:11.57, lon:104.905}`）换算；**判定它落在哪个 Khan（若图层里有 Khan 边界，用点在多边形内算法；没有就写「未知」，不要猜）**，把结果记在汇报里（给董事会核对 Khan 名称，同时对照 `town-names.js` 的待确认名称）。地图署名「© OpenStreetMap contributors」保持。**标注文案必须写「示意位置」**，不暗示测绘精度或产权。
4. **界面显示**：顶栏 / 页脚已有的「金边」城市标签保持；可在「设置 / 关于」类位置显示「智序工场 · 13b Ke Nou St. (9), Phnom Penh（示意）」，**局域网只读用户与大屏模式不显示详细地址（只显示「金边」）**——地址只对本机完全访问用户显示。
5. **文档**：知识库已记录定位（董事会侧写）；你只需在 `README.md` 说明 `OFFICE_GEO` 的用法与「如需再变更，只改这一处」。

## 测试与验收
- 纯函数：`OFFICE_GEO` 冻结、字段齐全、经纬度范围合理；`PNH` 取自它；天气 URL / 雷达瓦片的断言（上面第 2 条）；地标换算坐标落在地图画布范围内；LAN / 大屏不包含地址文本（断言）。
- `node --check`；全量 `node --test tests/*.test.mjs` 全过（**不得放宽既有断言**；若某个既有断言写死了旧坐标，列出并说明理由）。
- **在线（我重启后验收）**：`/state` 里 `weather.location` 为新坐标；`/town/map` 返回的新地标；局域网视角不含地址。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `server.mjs` 接线行与 Khan 判定结果。**不要自己重启服务。**
