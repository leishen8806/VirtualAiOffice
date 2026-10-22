# P1-fix：精确坐标仍会暴露给局域网 / 大屏（只改 `server.mjs` 与 `town-map.mjs` 的出口处理，约 30 分钟）

**执行者：Trae（接在 P1 之后，同一会话即可；做完停下等验收）。** 先读：`_lane-main.md`、你自己的 `office-geo.mjs`、`town-map.mjs`（`redactOfficeDetails`）、`server.mjs` 里 `world.weather` 的构造（`location: { lat: PNH.lat, lon: PNH.lon }`）与 `/town/map` 的 `redactOffice: lanUser || wallScope`、`tests\office-location.test.mjs`。开工先备份 `server.mjs`、`town-map.mjs` 到 `office3d-backup-p1-fix`（**必须备份，已有目录则加序号**）。**只允许改这两个文件、`office-geo.mjs`（如需新增脱敏辅助函数）与对应测试。**

董事会 2026-10-21 要求：**详细地址与精确坐标只对本机完全访问用户显示；局域网只读与大屏只显示「金边」。** 董事会侧用真实服务复核 P1（其余——`PNH` 取自 `OFFICE_GEO`、天气 / 雷达沿用、`/town/map` 地标与 Khan 判定为 `Khan Chamkar Mon`、地址已对 LAN / 大屏去除——都正确），发现**精确坐标仍然暴露**：

1. **`/state` 的 `world.weather.location`** 含 `lat 11.5536458, lon 104.9318027`，**局域网用户与大屏都能读到 `/state`**；
2. **`/town/map` 的脱敏版本**只去掉了 `address` 并改了 `note`，**`lat / lon / point` 仍然是精确值**（`point` 是相对已公开的投影原点的米坐标，可以反推经纬度）。

## 要求
1. 新增纯函数 `coarsenGeo(lat, lon)`（放 `office-geo.mjs`）：**四舍五入到 0.01°（约 1.1 km）**，返回新对象；对本机完全访问用户**保持精确**（天气请求与雷达瓦片计算仍用精确的 `PNH`，不变）。
2. `/state`：`world.weather.location` 对 **`lanUser` 或 `wallScope`** 使用 `coarsenGeo` 的结果；本机完全访问保持精确。**请核对 `/state` 与 `/wall/data` 全文不再出现精确坐标字符串**（用测试固定：对象序列化后不含 `11.5536458` 与 `104.9318027`，也不含它们的前 6 位小数以内的变体 `11.55364`、`104.93180`）。
3. `/town/map` 脱敏版本：对 LAN / 大屏，办公室地标**删除 `address / lat / lon`，`point` 粗化到 500 m 网格（`Math.round(x/500)*500`）**，`khan` 保留，`note` 保持「示意位置」；本机完全访问保持原样。注意 ETag / 缓存：脱敏与非脱敏版本的 ETag 必须不同（现有机制若已区分则保持）。
4. **回归**：`PNH`、天气请求 URL、雷达瓦片行列号的既有测试**不得改动**，仍全过；`node --test tests/*.test.mjs` 全过；汇报「做到 / 没做到 / 未验证」，与磁盘一致；**说明 LAN / 大屏路径是用单元测试覆盖还是实测**（真实局域网会话需要访问码，**不要索取访问码**，以注入 `lanUser:true` 的单元 / 函数级测试覆盖）。**不要重启服务。**
