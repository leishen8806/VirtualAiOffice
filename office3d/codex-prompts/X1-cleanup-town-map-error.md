# X1-cleanup-town-map-error：清理两个临时文件 + 地图接口缺文件时不再回显系统错误原文（小任务）

**建议执行者：Trae（新会话）。很快就能完成。** 先读 `_common.md`、`town-map.mjs`、`tests/town-map-api.test.mjs`。

**例外规则：** 只允许：① 把两个临时文件**移动**（不是删除）到备份目录；② 修改 `town-map.mjs`、`tests/town-map-api.test.mjs`、`README.md`（只在「金边小镇地图」一节补一句）。**不要改**：`server.mjs`、`town-map.json`、`town*.js`、`tenancy\`、其它任何文件。**不得向 Paperclip 发任何写请求**，不联网、不装依赖。纯服务端小改，**需要重启服务才生效**（汇报里写明，不要自己结束进程）。

## 1. 清理两个临时文件（先看再动）
多租户安全设计（`multitenant-design\m5-0-design.md` 第 11 节「发现但未处理的可疑内容」）指出办公室目录里留有两个旧验证产物：
- `office3d\tmp-review-idle-25h.mjs`：**写死了当前公司 id**，并直接请求该公司的 issues / runs；
- `office3d\tmp-review-out.txt`：落在运行目录的临时输出。
做法：
1. **先读它们**（只读），在汇报里写出各自的用途、来源（看内容和修改时间推断）、有没有被任何文件引用（`grep` 全目录，包括 `tests\`、`*.mjs`、`*.js`、`README.md`）；**如果发现被任何代码 / 测试 / 文档引用，停下来汇报，不要移动**；
2. 确认没有引用后，**移动**（`Move-Item`）到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-x1\`（不要删除，保证可恢复）；
3. 全目录 `grep` 再确认没有其它 `tmp-review-*` 或类似「写死 company id 的临时脚本」；**发现别的就只报告，不要动**；
4. 确认 `GET /tmp-review-out.txt` 与 `/tmp-review-idle-25h.mjs` 仍是 404（本来就在静态白名单外；移走后也应 404）。

## 2. 地图接口缺文件时不回显系统错误原文
**现象（我实测过）：** `town-map.json` 缺失或不可读时，`GET /town/map` 返回 503，响应体和日志里带 `ENOENT: no such file or directory, open '…'` 这类 Node 系统错误原文（路径已被去掉，但仍泄漏了错误类型与文件系统细节）。
**要求：**
- 对外（HTTP 响应体）**只给固定中文提示**：`{"error":"地图数据暂不可用"}`（状态码仍是 503，`Cache-Control: no-store`，`X-Content-Type-Options: nosniff` 保持；`HEAD` 无响应体）；
- 日志只记一行**不含路径、不含系统错误原文**的摘要（例如 `[town-map] 加载失败：文件不存在 / JSON 无效 / 校验失败` 三类枚举），方便排查又不泄漏；
- **其它行为一概不变**：200 / 304 / `ETag` / `HEAD` / 405 / 大屏令牌 403 / 校验逻辑 / 净化。
- 测试：缺文件、不可读（用临时目录制造权限 / 目录冒充文件）、非 JSON、缺图层、体积超限各一例：响应体都等于固定中文提示、**不含 `ENOENT` / `EACCES` / 路径片段 / 盘符 / `\\`**；日志同样断言不含这些；**既有 7 项测试全部保持通过，不得放宽**。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（当前基线 **518 项起**）；`node --check town-map.mjs`。
- 汇报：两个临时文件的用途与引用核查结果、移动后的位置；`town-map.mjs` 的逐行差异；重启后需要执行的命令（由人重启后我来在线验收：`curl -i /town/map` 仍 200 + ETag；临时把 `town-map.json` 改名后 503 响应体应是固定中文提示——**这一步由我做，你不要在运行中的服务上改名**）。
- **不要自己结束或重启进程。**
