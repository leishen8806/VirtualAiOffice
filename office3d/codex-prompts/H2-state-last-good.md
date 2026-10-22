# H2-state-last-good：Paperclip 暂时不可用时 `/state` 不再 502、页面不再白屏（主线 · 约 1–1.5 小时）

**执行者：Trae（主线；新会话或 C5d 同一会话均可，但 C5d 先验收完）。** 先读：`_common.md`（含 2026-10-22 新增的「精简实现，不精简已批准目标」）、`server.mjs` 的 `state()`（约第 929 行）、`/state` 路由（约第 1232 行）、`get()`（约第 170 行，8 秒超时）、`healthReport()`（约第 915 行）、`tests\` 里与 `/state` 和 H1 健康报告相关的测试、记忆文件 `C:\Users\Administrator\.claude\projects\E--VirtualAIOffice\memory\paperclip-crashes-memory-pressure.md`（背景）。

## 背景（我今晨实测，不是推测）
2026-10-22 上午 Paperclip（:3100）三次无响应（机器可用内存一度只剩 0.6 GB），冷启动约 8 分钟，期间第一次 `heartbeat-runs?limit=1000` 要 22 秒（热后 2 秒）。`state()` 用 `Promise.all` 同时拉 8 个上游接口，**任何一个超过 8 秒或失败，整个 `/state` 返回 502**，页面一直停在「马上就好…」，治理中心等所有依赖 `/state` 的功能同时失效。

## 要做的事
1. **最近一次成功快照（last-good）**：`state()` 成功后在内存保存一份快照（含生成时间）；**同时原子写入一份本地文件** `state-last-good.json`（临时文件 + rename；**写入前去掉 `actToken` 与任何访问码 / 令牌字段**；文件放在 `office3d` 目录并加入「不会被静态服务暴露」的保证：`.json` 本来就不在静态白名单，请用测试再确认一次）。服务启动时读取该文件作为初始快照（损坏或缺失则忽略，不报错）。
2. **降级返回**：`/state` 的上游调用失败或超时时，**不返回 502**，返回 `200` 的最近快照，并加字段 `stale: { active: true, since: <快照生成时间>, ageMs, reason: 'UPSTREAM_UNAVAILABLE' }`；上游恢复后下一次成功即清除。**降级期间 `actToken` 置空、`/act` 写操作保持现有行为（上游不可用则它们自己失败，不得假装成功）。** 快照超过 30 分钟时 `reason` 改为 `STALE_DATA` 并保持 200，页面据此提示；**从未有过快照（首次安装）才返回 503 并带明确原因，不得伪造空数据。** 局域网 / 大屏的脱敏与权限处理**在降级快照上同样执行**，且不得因此多暴露任何字段。
3. **按组件降级，不整体失败**：把 `state()` 里的上游调用分成「必需」（agents、dashboard、issues）与「可选」（runs、approvals、activity、approvalsAll、backlog）。可选项失败时该部分返回空并在 `state.gaps` 里列出缺失的部分及原因，其余照常返回；必需项失败才走第 2 条的 last-good。**所有「未知」继续显示未知（value + reason），不得用 0 或空数组冒充已知。**
4. **重查询**：`healthReport()` 的 `heartbeat-runs?limit=1000`（冷启动 22 秒）不得再阻塞 `/state`：它已有 30 秒缓存，请改成**后台刷新 + 超时（建议 20 秒）+ 失败保留上一次报告并标记过期**，`/state` 永远读缓存。**不得改变 H1 健康判定的结果**；若要降低 `limit`，必须用 H1 的真实形状测试证明结果不变，否则保持 1000 并只做后台化。
5. **前端不动**：本卡**不改 `app.js`**（它是 Codex 会话一的热点文件）。页面只要拿到 200 就能进入场景；`stale` 字段的页面提示（顶部一行「数据来自 N 分钟前（Paperclip 暂不可用）」）我会另开一张 ≤10 行的钩子卡给 Codex。本卡只保证字段稳定、文档写清。
6. **监控口子**：`/state` 降级时在服务日志写一条（不是每次请求一条：状态变化时各写一次）`[state] 降级：上游不可用，使用 N 分钟前的快照` 与 `[state] 恢复`。
7. **测试（不放宽已有断言）**：上游全部正常 → 与改前返回逐字段一致（`stale` 不出现或为 `{active:false}`）；必需项失败且有快照 → 200 + `stale.active`；必需项失败且无快照 → 503；可选项失败 → 200 + `gaps`；快照文件损坏 / 缺失 / 含 `actToken` 时的处理；写文件不含 `actToken`；局域网与大屏下降级快照的脱敏与正常路径一致；降级时 `/act` 不假成功；`healthReport` 后台刷新超时不影响 `/state` 响应时间；静态检查（不新增写 Paperclip 的路径、无 `Math.random`、无 `eval`）。全量 `node --test` 全过。

## 验证与约束
- 用假上游（注入的 `get`）验证，**不要停止或重启真实的 Paperclip 与 office3d**，不要自己重启服务；`server.mjs` 改动后由我验收时重启并验证单监听。
- 备份 `server.mjs` 与相关测试到上一级目录 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-h2`。不要读取或打印任何密钥；不要改局域网访问码 / Host 校验 / `act()` 鉴权；不新增服务端路由。
- 汇报「做到 / 没做到 / 未验证」，列出改动的函数与行数；**停下等我验收**（我会在线用真实 Paperclip 验证：正常、模拟上游慢、重启后的首次请求）。
