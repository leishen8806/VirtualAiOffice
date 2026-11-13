被测代码：Paperclip 3100 官方 2026.1106.0，commit d69631b01b9c658f80bf8bed389863dce82643e1；数据时间：2026-11-13T17:57:08.526Z；只读GET。

# ORG-1 归组建议

## 数据边界

- 3100健康检查：ok，版本 2026.1106.0。岗位数：30。
- 时间窗口：2026-11-06T17:57:08.526Z 至 2026-11-13T17:57:08.526Z。
- 留底文件：[roster-20261114.json](./roster-20261114.json)、[roster-20261114.csv](./roster-20261114.csv)。
- 完成卡数按成功运行关联的 issue 去重；接口有上限，属于接口可见下界。

## 每岗位归组建议

| 现岗位名 | 显示名 | 新归属 | 依据（近7天成功卡） | 在跑卡 | 说明 |
|---|---|---|---|---|---|
| Architect | 架构师 | 独立验收线 | CMP-1648、CMP-1652、CMP-1662 | 无 | 审查、回归和安全验收 |
| Backend1 | 后端工程师 #1 | 核心服务组 | CMP-1642、CMP-1658、CMP-1665 | 无 | 后端、数据库和接口契约 |
| Backend2 | 后端工程师 #2 | 司机端流 | CMP-1631、CMP-1673、ef784899-9627-408f-89db-024443ddd1d1 | 无 | 司机端、车辆和调度交互 |
| BackendSenior | 后端高级工程师 | 核心服务组 | CMP-1657、CMP-1675、CMP-1681 | 无 | 后端、数据库和接口契约 |
| DBEngineer | 数据库工程师 | 核心服务组 | CMP-1569、CMP-1638、fc51c657-cda3-4b3e-85f0-cd05504111f5 | 无 | 后端、数据库和接口契约 |
| Frontend1 | 前端工程师 #1 | 管理后台流 | CMP-1571、CMP-1577、d3d05a45-6a96-4452-a7f6-61794df575bf | 无 | 前端客户端或管理界面实现 |
| Frontend2 | 前端工程师 #2 | 独立验收线 | CMP-1618、CMP-1654、CMP-1663 | 无 | 审查、回归和安全验收 |
| FrontendSenior | 前端高级工程师（含 3D） | 司机端流 | CMP-1318、CMP-1488、CMP-1493 | 无 | 司机端、车辆和调度交互 |
| Go1 | Go 工程师 #1 | 专项组 | 无 | 无 | 调度算法、计费与结算；当前 Go 运行栈需另行确认 |
| Go2 | Go 工程师 #2 | 专项组 | 无 | 无 | 调度算法、计费与结算；当前 Go 运行栈需另行确认 |
| GoSenior | Go 高级工程师 | 非 RouteFit，去向等董事会定 | CMP-648、CMP-1245、CMP-1263（均为 Dr.life+） | 无 | 暂停；近7天证据属于 Dr.life+ 商城线 |
| GoSenior2 | Go 高级工程师 #2 | 非 RouteFit，去向等董事会定 | CMP-1247（Dr.life+） | 无 | 暂停；近7天证据属于 Dr.life+ 商城线 |
| KnowledgeKeeper | 知识库管理员 | 转 RouteFit（建议暂停或转赋能组） | 7d4c072c-616d-4b00-93ad-c41664467e12、8a22f8b7-5be2-4005-834b-1c555c1f3157、fb32b785-671c-4e7e-abf9-cf0395c07a9e | 无 | 近7天活动仍以非 RouteFit 为主，需董事会决定转岗或暂停 |
| Lead | 技术负责人 | 转 RouteFit（建议暂停或转赋能组） | CMP-1655、CMP-1659、CMP-1660 | 无 | 近7天活动仍以非 RouteFit 为主，需董事会决定转岗或暂停 |
| Lead2 | 技术协调 #2（答疑分担） | RouteFit 总负责 | CMP-1358、CMP-1433、CMP-1627 | 无 | 跨流协调与排程 |
| LedgerAuditor | 账务审计员 | 赋能组 | 无 | 无 | 近7天卡片不足以证明其他专门归组，建议负责人复核 |
| Localizer | 本地化工程师（中/英/高棉） | 客户端流（Mini App/H5/官网） | 8aa34d9e-bbe1-4daa-ba80-3414842f4cc5 | 无 | 前端客户端或管理界面实现 |
| OpsEngineer | 运维工程师 | 平台组 | 无 | 无 | Paperclip 平台、CI 和运行维护 |
| OpsLead | 运维负责人 | 客户端流（Mini App/H5/官网） | CMP-1596、CMP-1629、CMP-1679 | 无 | 前端客户端或管理界面实现 |
| PM | 产品经理 | 非 RouteFit，去向等董事会定 | CMP-1651、CMP-1661（运营与知识库）、CMP-909（Dr.life+） | 无 | 在岗；近7天可见证据 1/3 为 Dr.life+、2/3 为运营与知识库，交董事会定 |
| QAAutomation | 测试自动化工程师 | 独立验收线 | CMP-1362、CMP-1375、CMP-1546 | 无 | 审查、回归和安全验收 |
| React1 | React/TS 前端工程师 | 司机端流 | CMP-1317、CMP-1380、CMP-1410 | 无 | 司机端、车辆和调度交互 |
| React2 | React/TS 前端工程师 #2 | 客户端流（Mini App/H5/官网） | 0e0a1fa8-1249-465a-badb-8e65bad0671b、CMP-1319、CMP-1623 | 无 | 前端客户端或管理界面实现 |
| ReactSenior | React/TS 高级前端 | 管理后台流 | CMP-1490、CMP-1491、e2d8c826-5a40-4f79-9d16-7bb36555c223 | 无 | 前端客户端或管理界面实现 |
| Reviewer1 | 代码审查员 #1 | 非 RouteFit，去向等董事会定 | CMP-1274（Dr.life+）、CMP-1511、CMP-1506（Dr.RouteFit） | 无 | 卡住；近7天可见证据约1/3 Dr.life+、2/3 Dr.RouteFit，交董事会定 |
| Reviewer2 | 代码审查员 #2 | 独立验收线 | CMP-1670、CMP-1671、e8d775b8-f4a8-42a1-aeb1-9a30b8762393 | 无 | 审查、回归和安全验收 |
| Reviewer3 | 代码审查员 #3 | 独立验收线 | CMP-1680、CMP-1683、CMP-1684 | 无 | 审查、回归和安全验收 |
| SecurityReviewer | 安全审查员 | 独立验收线 | CMP-1639、CMP-1677、ff6a6e5e-0bf2-4390-86fe-346e13de173e | 无 | 审查、回归和安全验收 |
| SecurityReviewer2 | 安全审查员 #2 | 独立验收线 | CMP-1501、CMP-1633、CMP-1668 | 无 | 审查、回归和安全验收 |
| UIUX | UI/UX 设计师 | 客户端流（Mini App/H5/官网） | 05f5feb0-494d-40b4-8d0a-b95bde4301ef、11e050f5-819e-4d3f-a5b2-10320cab99c9、316aa828-678f-4424-b599-e2a4d44a2128 | 无 | 前端客户端或管理界面实现 |

## 负责人候选（只提名）

- 司机端流：Backend2（CMP-1631、CMP-1673、ef784899-9627-408f-89db-024443ddd1d1）；FrontendSenior（CMP-1318、CMP-1488、CMP-1493）
- 客户端流：Localizer（8aa34d9e-bbe1-4daa-ba80-3414842f4cc5）；OpsLead（CMP-1596、CMP-1629、CMP-1679）
- 管理后台流：Frontend1（CMP-1571、CMP-1577、d3d05a45-6a96-4452-a7f6-61794df575bf）；ReactSenior（CMP-1490、CMP-1491、e2d8c826-5a40-4f79-9d16-7bb36555c223）
- 核心服务组：Backend1（CMP-1642、CMP-1658、CMP-1665）；BackendSenior（CMP-1657、CMP-1675、CMP-1681）

## 编制对照

| 组 | 当前建议数 | 建议编制 | 缺口/多余 |
|---|---:|---:|---:|
| RouteFit 总负责 | 1 | 1 | — |
| 司机端流 | 3 | 4 | 缺 1 |
| 客户端流（Mini App/H5/官网） | 4 | 4 | — |
| 管理后台流 | 2 | 4 | 缺 2 |
| 核心服务组 | 3 | 5 | 缺 2 |
| 专项组 | 2 | 2 | — |
| 平台组 | 1 | 2 | 缺 1 |
| 赋能组 | 1 | 4 | 缺 3 |
| 独立验收线 | 7 | 3 | 多 4 |
| 非 RouteFit，去向等董事会定 | 4 | — | 待董事会定 |

## Go 岗位

- Go1：建议撤掉；只读核对 RouteFit 仓库未发现 go.mod 或 Go 服务引用，当前没有 RouteFit Go 技术栈证据。
- Go2：建议撤掉；只读核对 RouteFit 仓库未发现 go.mod 或 Go 服务引用，当前没有 RouteFit Go 技术栈证据。
- GoSenior：建议撤掉；只读核对 RouteFit 仓库未发现 go.mod 或 Go 服务引用，当前没有 RouteFit Go 技术栈证据。
- GoSenior2：建议撤掉；只读核对 RouteFit 仓库未发现 go.mod 或 Go 服务引用，当前没有 RouteFit Go 技术栈证据。

## 新增后端岗位

- Backend3：未建。
- Backend4：未建；此前仅彩排 pending_approval，不算线上已建。

## 非 RouteFit，去向等董事会定

以下岗位按近 7 天实际卡所在项目单列，不标“转 RouteFit”，也不标“暂停”：

| 岗位 | 当前状态 | 在跑卡 | 近7天实际卡及项目依据 |
|---|---|---|---|
| GoSenior | 暂停 | 无 | CMP-648、CMP-1245、CMP-1263，均为 Dr.life+ |
| GoSenior2 | 暂停 | 无 | CMP-1247，为 Dr.life+ |
| PM | 在岗 | 无 | CMP-1651、CMP-1661（运营与知识库）；CMP-909（Dr.life+），可见证据约 2:1 |
| Reviewer1 | 卡住 | 无 | CMP-1274（Dr.life+）；CMP-1511、CMP-1506（Dr.RouteFit），可见证据约 1:2 |

本次返回的近7天可见证据中未发现 KhmerX 项目岗位；不据岗位名称推断，后续若补到 KhmerX 卡，再按同一规则追加到本组。

## 切换步骤草案（只写不做）

1. 先保留 JSON/CSV 快照，由董事会确认新归属和汇报对象。
2. 逐岗位只改组织字段：reportsTo，以及系统已有的归组字段；没有独立归组字段时，只通过 reportsTo 和组织台账表达。
3. 不改提示词、模型、预算、workspace、技能、权限；不暂停、不恢复、不取消运行、不重建岗位；在跑的卡照旧完成。
4. 每次改后只读 GET 岗位详情和汇报链，保存前后差异；失败停止，不重试。
5. 回退时按本快照恢复 reportsTo 和归组字段，仍不改运行配置。

## 非 RouteFit 卡清单

在 3100 返回的 500 条 issue 中，按项目名/标题筛选“仓配、OA、3D、小镇、经济小镇、Office”，并只保留 `in_progress` 或 `todo`：

| 卡号 | 岗位 | 状态 | 项目 | 说明 |
|---|---|---|---|---|
| CMP-789 | Frontend1 | todo | Virtual AI Office | OFFICE-R1-I7B-B 演示部门；非 RouteFit，等待董事会决定，不停止 |

未发现当前 `in_progress` 的仓配、OA、3D 小镇或经济小镇卡。接口返回有上限，若要证明全库无其它卡，需要继续分页；本轮未对任何卡做状态修改。

## 未做

- 未改3100任何配置、岗位、汇报线、任务状态、阻塞关系。
- 未连接5432；未暂停、恢复或取消运行。
- 未把建议当成董事会决定。
- 已按第 385 条单列。
