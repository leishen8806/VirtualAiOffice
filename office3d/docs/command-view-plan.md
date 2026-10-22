# Helix 指挥视图规划

版本：C1 / CommandViewData v1，2026-10-21。状态：规划待董事会批准，未接线、未上线。
产品：Virtual AI Office。定位：现有治理体系的统一只读投影，不是第四套系统，不改变 Paperclip 状态机、任务所有权或审批权。

## 1. 范围与事实依据

第一版：一个经授权的现有项目、一项真实任务的经历，二维只读运行视图与现有治理入口跳转。董事会督办看结果与决策，Agent 运行看执行与故障，小镇空间只看团队摘要；三者使用同一份有版本、范围与质量信息的投影。不做自动批准、强制完成、一键重做或新的模型调用。

本次仅新增规划、离线检查脚本、脱敏合成 JSON，README 只追加索引。无网络请求、无生产资料导出、无 Paperclip 写入，无场景/服务修改。没有新开关或路由正在运行。

依据：

- `knowledge/项目/现状盘点与融合策略.md` 第四、八、九节：事件驱动闭环、授权边界、证据版本、未知用量与公司隔离。
- `paperclip-ops/mainline/l0/l0-report.md` 第 12、22、24 节：历史样本 633 次运行中 115 次缺 usage；当时全部 633 次都无可用成本字段。当前 Agent 配置可以关联缺失运行，但不能证明那次实际模型或补出 token/cost。
- L0 第 15 节：直接更新 Paperclip 状态、写评论、外部入口或关闭本地 evidence-version 均可绕过办公室局部门禁。不能声称全局强制。
- `contract-view.mjs`、`scheduler-view.mjs`、`scheduler-core.mjs`、`done-rules.mjs`、`event-envelope.mjs` 及 `server.mjs` / `ui.js` 只读源码：按现有合同与数据能力规划，不改产品规则。
- 知识库 `前厅与小镇规划.md` 二十七至三十节：精确位置不进入指挥数据；工作/生活时间与账本分开，模拟展示不冒充真实工作。
- “钉钉 AI-CEO 战役督办舱”“赛博老爸大屏”的产品名称、源码、许可证、接口未核验。本次只借鉴管理逻辑与布局，不下载、复制、运行或复用外部源码。以后复用须固定来源版本、核验代码/素材许可并获董事会批准。

L0 的 activity 稳定键：`action, actorId, actorType, agentId, companyId, createdAt, entityId, entityType, id, responsibleUserId, runId`。`agentId/runId` 可为空，操作者为 `agent/board/system`；事件类型来自 `action`。`issue.updated` 不等于状态变化或返工，`issue.blockers_updated` 不等于进入阻塞。没有独立 test/review/acceptance 状态事件。

## 2. 现状对照与真正缺口

| 已有能力 | 实际来源/现有入口 | 指挥视图应做什么，不重复什么 |
|---|---|---|
| 任务、执行与团队 | `/state.assigned/agents/task/liveRun/lastRun/waiting/projects/today`，任务面板 | 共用快照，增加范围/质量，不另建任务列表权威 |
| 审批与委员会 | `/state.approvals/pendingApprovals/committee/voteSessions`，内容审批入口 | 只摘要待处理对象，跳转现有审批，不复制审批写按钮 |
| 晨会 | `/state.standup`、`/governance` 的批次历史/统计 | 只关联授权来源，不把提议当授权 |
| 超时验收 | `/state.acceptance`、治理历史 acceptance 批次 | 投票结果不单独证明产出版本有效，保留现有入口 |
| 阻塞巡检 | `/state.blockedPatrol`、`/blocked/preview` | 复用确定性原因，显示下一处理人，不能触发巡检写操作 |
| 返工 | `/state.rework`、`/governance.rework`、`/rework` | 显示现有有来源的轮次；activity 更新数不能补成轮数 |
| 交接 | `/state.handoff`、`/governance.handoff` | 显示缺包/触发摘要，跳转交接，不复制扫描 |
| 记忆与对话 | `/state.memory/chat`、现有记忆/对话面板 | 仅状态与引用；不复制正文，不把待审记忆当已确认经验 |
| 契约 | `/state.contractView`、`/contract-view`，受开关控制 | 摘要是否完整/错误码；完整契约不是审批通过 |
| 调度建议 | `/scheduler/suggest`，L3a-3 校验与 L3c 懒补取 | 复用原因码与缓存；建议不是已分配/已领取 |
| 工作量 | `/state.workload`、`/workload`，按需面板 | 保留不足以判断、缺口与时间窗口，不用消息数评绩效 |
| 运行健康 | `/state.healthLevel`、`/health`，H1 分类 | 模型繁忙不等于额度耗尽；仅跳转健康详情 |
| 版本核对 | `/governance.version`、`/evidence-version` | 只读检查摘要；不是全局完成拦截器 |
| 活动与协作 | `/state.events/ledger`、`/collab`；逐任务 activity | 说明来源、去正文；统计互动不表示实际调用链 |

缺口：统一有范围的任务 ID/成员 ID/证据版本投影、下一处理人和入口枚举、可机检的新鲜度与未知指标、按任务合并历史但不捏造状态转换、公司切换防串数据。C1 不补齐不可用源；原面板的默认 0、裸标题、正文或缓存键不直接复制为新合同。

## 3. CommandViewData v1

JSON 顶层固定为 `{schemaVersion, generatedAt, dataAgeMs, mode, company, scope, summary, queue, relations, execution, timeline, quality}`。不把整个 `/state` 透传。

### 3.1 共用数据表示

`Measurement<T> = { value: T|null, reason: ReasonCode|null }`：

- 已确认：`value` 是有限非负数字或合法类型，`reason:null`。确认的空集合计数可为 0，例如确有 0 个运行；这不是未知成本。
- 未知：`value:null` 且原因码非空；不允许缺字段、空字符串、NaN、Infinity、`value:0 + reason:USAGE_NOT_RETURNED`。
- 集合 `{items,complete,reason}`：仅成功且范围完整时空数组意味着“没有”；未加载/失败用 `items:[],complete:false,reason:DEP_NOT_LOADED` 等。摘要计数对不完整源用 null，不能用空数组长度充当 0。
- 协议空值 reason=null 表示已知；其他未知标量都用 Measurement。公司/任务作用域身份不可未知：无授权身份时整体拒绝/空状态，不查询上游。
- 原因码包含：`NOT_LOADED, SOURCE_DISABLED, SOURCE_FAILED, PARTIAL_PAGE, UNKNOWN_TIME, DISCONNECTED, STALE_DATA, EVIDENCE_NOT_CONNECTED, LEGACY_BASELINE, NO_TEST_EVIDENCE, NO_ACCEPTANCE_EVIDENCE, NO_AUTHORIZATION_EVIDENCE, NO_CHECKOUT_EVIDENCE, NO_STATUS_TRANSITION, NO_CALL_EVIDENCE, DEP_NOT_LOADED, DEP_UNKNOWN, OWNER_UNKNOWN, USAGE_NOT_RETURNED, RUN_MODEL_NOT_RETURNED, NO_CONFIRMED_COST, COST_NOT_RETURNED, NOT_APPLICABLE, SYNTHETIC_DEMO`。未知码拒绝，不吞错。
- 标题最多 80 个 Unicode 字符，比现有 200 字截断更严格；先去控制字符与敏感模式再截断。其他标签/原因最多 160 字，正文/评论/输出/内部地址一律不输出，即使键名是 `title` 也扫描值。
- 所有真实 ID 只在已授权 live 范围中使用；外显公司/任务/成员绑定本机网关身份。demo 只用 `demo-*`，不生成似真实 UUID、任务编号、SHA、客户名；真实数据脱敏导出需另审查，不能靠改 mode 变 demo。

### 3.2 字段目录

| 字段与类型 | 来源/口径 | 未知/隐私 | 更新与缓存 |
|---|---|---|---|
| schemaVersion:1 | 投影接口版本，非 Paperclip schema 版本 | 不识别版本拒绝 | 版本变更独立审批 |
| generatedAt:ISO UTC | 注入快照生成时刻，不是每次渲染时刻 | 无可靠时刻不制造 live 快照 | 命中缓存保持原时刻 |
| dataAgeMs:Measurement<number> | 查看时刻减最老关键源采样时刻 | 无采样时间为 null/UNKNOWN_TIME；不重置为 0 | 展示时间计算不发请求 |
| mode:live/replay/demo | 明确选取的数据域 | 不自动从 live 失败降为假 demo | 切模式清除旧响应 |
| company:{id,name} | 经服务端确认的唯一公司上下文 | 名称最小公开别名；不能由查询参数越权 | 缓存含公司/授权范围 |
| scope.project:Measurement<ID> | 已授权项目；null/NOT_APPLICABLE 为公司范围，须另授权 | 不跨项目混合详情 | 当前项目/任务选择变更清局部缓存 |
| scope.range:{from,to} | 显式 UTC 时间窗 | 不默认全历史；无范围拒绝 | 默认今日，详情最多 14 天 |
| summary.tasks/running/accepted:Measurement<int> | 完整范围任务、当前运行、已验证版本的验收数 | `/state` 活跃任务列表不完整时 tasks=null/PARTIAL_PAGE；未接证据 accepted=null | 快照增量重算；无按任务 GET |
| summary.cost | currency、confirmedAmount、totalAmount、confirmedRuns、unknownCostRuns、missingUsageRuns、observedRuns、lastUpdatedAt，指标均 Measurement | confirmedAmount 为确认金额小计；无确认记录=null/NO_CONFIRMED_COST；任何成本未知 totalAmount=null；币种不混加 | 复用真实成本聚合快照；不从月额度/时长估成本 |
| queue[] | taskId/projectId/title/rawStatus/stage/stageReason/ownerId/blocker/nextHandler/entry/waitingSince/waitingMs/progress/evidence | ID 映射可复核；等待无状态对=null/NO_STATUS_TRANSITION；下人缺失=null/OWNER_UNKNOWN | `/state`/已有治理摘要；200 项上限，已加载/分页标明 |
| queue.progress | passed/total:Measurement<int> | 只用同版本验收项 n/m；没证据两个 null，不用耗时换百分比 | 与证据版本缓存同生效 |
| queue.evidence:Measurement<object> | subjectVersion、records、protectedTestsHash、executorActor、boardActors、riskClass | 未接=null/EVIDENCE_NOT_CONNECTED；ref 使用不含路径的安全标识 | 只在选中任务时补取；60s/version-key |
| relations | organization/dependencies/calls 三个独立集合 | 无关联来源不得画边；数组不完整标码 | 选中项目/任务懒加载 |
| execution.items[] | runId/taskId/agentId/status/startedAt/finishedAt/model/modelSource/usage/cost/family/healthCategory | 不含 PID、输出、异常全文、CLI 命令；Agent 配置模型仅标 source=agent_config，不声称本次模型 | 复用运行快照；详情60s |
| timeline.items[] | id/taskId/runId/at/type/operator/source/stage/stageReason/evidence | 只事件类型/时间/操作者；不能读 body 推断状态；runId=null/NOT_APPLICABLE | 选中任务才读 activity，60s |
| quality | synthetic、freshness、sources[]、gaps[]、writesAllowed:false | 每个源 ageMs/complete/reason；敏感字段不在投影中 | 随快照；失联立即标记 |

evidence.records 只取 `kind,ok,actor,ref,subjectVersion,protectedTestsHash` 以及必要时间，不取 evidence 评论全文。生产 subjectVersion 的本机绝对路径不得导出；先在服务端按相同版本比较规则评估，再投影资源别名与同版本判定。检查脚本使用 `done-rules.evaluateDone` 的结构化输入，不能靠 `done:true` 字符串或 UI 选择建立信任。

## 4. 阶段映射，不新增状态机

| 展示阶段 / code | 可靠依据 | 当前能力与第一版 |
|---|---|---|
| 需求确认 / requirement_confirmed | 完整契约且显式授权证据 | 契约完整只能证明格式；缺授权显示 pending_verification/NO_AUTHORIZATION_EVIDENCE |
| 已领取 / claimed | 原生 checkout/lease、绑定任务与运行 | 有 assignee 不等于领取；仅调度 pick 或 runId 不够，未补源显示 pending_verification/NO_CHECKOUT_EVIDENCE |
| 执行中 / executing | 同任务 heartbeat running + startedAt/归属 | `/state.agents.liveRun` 不直接给 taskId；无法可靠关联时只显示 Agent 运行，不把活动任务硬绑定 |
| 验证中 / verifying | 同版本 execution/test 证据，验证状态可靠 | 当前默认未接线；只有 executed 不能宣称验证，未接显示 pending_verification/NO_TEST_EVIDENCE |
| 待验收 / awaiting_acceptance | 同版本验证与独立评审通过，提交验收引用 | in_review 只显示原生审查态；无证据不提升，显示 pending_verification/NO_ACCEPTANCE_EVIDENCE |
| 已验收 / accepted | evaluateDone enforced=true、accepted 或更高、版本有效、独立评审/测试保护/指定验收人通过、无阻断原因 | `done`/succeeded/投票 PASS/评论“验收”/LEGACY_BASELINE 均不充分；无有效证据显示 pending_verification |

判定优先级：先检查公司与任务归属、证据版本及测试保护，再展示最强的已证实阶段；缺证据不猜。`done-rules` 为纯规则且默认未接线，`evaluateDone` 的 legacy `accepted` 输出不能直接上屏。历史验收单列“旧验收基线”，不计已验收数。对 money/server 要有 boardActors 授权验收；version mismatch 与 protected test mismatch 降级为待验证。

返工是队列状态/时间线事件，不是第七个完成阶段；取消、暂停、阻塞保留 rawStatus 和等待原因。新的运行在 H1 健康中可算故障恢复，但不等于任务验证通过。没有明确返工来源不能用 issue.updated 计返工。

## 5. 三类关系

| 类别 | 来源、可信度 | 展示与禁止 |
|---|---|---|
| organization | 已授权 Agent 组织/负责人字段；未返回则 null/缺口 | 选中项目的人物，弱线；岗位配置不是调用链 |
| dependencies | 任务详情 blockedBy + 依赖状态；L3c dependencyKnown | 选任务才显示，DEP_UNKNOWN 不画“无依赖”；DEP_CANCELLED 继续阻断，取消不等于完成 |
| calls | 有父子运行或明确调用事件才是实际调用；activity.runId 只证明关联 | 当前无可靠调用父子链，默认关闭；协作对话/dispatch/report 另标“协作事件”，不改称调用 |

不随机连线，不把同一项目成员都相连，不由热闹程度产生绩效指标。每条边含 from/to/type/source/confidence；失败不回退到组织关系假扮执行调用。

## 6. 今日督办焦点

| 阻塞类型 | 确定性证据 | 下一处理人 / 只读跳转 |
|---|---|---|
| authorization | AWAITING_BOARD、有效审批待办 | 董事会/指定授权人，现有审批与治理入口 |
| dependency | DEP_PENDING/DEP_UNKNOWN/DEP_CANCELLED | 依赖负责人；未知则项目负责人核对，现有任务详情/调度建议 |
| budget | BUDGET_EXHAUSTED/MONEY_CLASS_NEEDS_BOARD | 预算授权人/董事会；BUDGET_UNKNOWN 只标待核对，不宣称耗尽 |
| verification_failed | 同版本失败测试或 review CHANGES | 当前任务负责人，现有返工面板；不自动重跑 |
| executor | H1 login/environment/worktree/upstream | 运行维护负责人；一次新 running 可恢复故障队列，不解除其他阻塞 |
| delivered_unaccepted | 当前交付记录 + 无有效验收 | 契约指定验收人；缺责任人则项目负责人/OWNER_UNKNOWN，现有验收入口 |

多个阻塞可共存。先展示必须由人决策的授权/资金/取消依赖，再按确认的等待起点排序，未知时间排最后并说明，最后 taskId 稳定排序。不向同一个 Agent 反复催促他无权解除的限制。

第一版只计算焦点，不发新通知。若后续批准提醒，复用现有巡检去重域：key=`company|project|task|blocker|subjectVersion|handler`，同版本同原因三小时冷却；处理人/版本变化重新校验；状态解除/授权撤销/公司切换/源过期立即停止。单次上限6、24h去重、升级给指定项目负责人/董事会，沿现有阈值契约另批，不能把提议当已开启的提醒机制。不调用模型决定阻塞或处理人，不新增业务写按钮。

## 7. 新鲜度与性能：不重演 L3c

- `/state` 保持原有取数与轮询频率。指挥投影从主运行时已有快照订阅；不在 `/state` 遍历任务调用 detail/activity/evidence，不新增第二个 EventSource、轮询器或状态所有者。
- L3c 现有上限：一次最多200任务，4并发，单请求5s，客户端/服务端60s缓存，展开且页面可见才取。这里只沿用上限与原则，不照搬现有未含公司上下文的缓存键。
- 未来共享懒取数协调器：每公司+授权范围总并发≤4；选中任务才取 detail/activity/evidence，活动页≤100条/页，≤200条/任务并标 PARTIAL_PAGE，不一次扫344项历史。最多200详情项LRU或16MiB；单响应≤1MiB；独立投影最多200队列/200时间线项。
- cache key=`schema|company|principalScope|project|task|range|source|subjectVersion`，TTL60s；同 key 单飞去重。snapshot 只读复用，不调用现有 `state()` 制造一轮额外 Paperclip 请求；无快照先显示 NOT_LOADED，不能盲目加请求。
- 404开关关闭、403权限撤销、超时、缺blockedBy：分别标 SOURCE_DISABLED/SOURCE_FAILED/DEP_UNKNOWN，不当空依赖；失败负缓存≤15s，GET仅下一次用户展开时重试，禁止后台循环。收到证据版本变化立即使旧版本结果失效，但不绕过60s限流。
- page hidden、面板关闭、路由离开：取消视图请求、停止新取数与动画；共用主线请求不被该面板取消。所有响应校验company/授权epoch，切换清空UI/选中项/缓存、递增epoch，丢弃迟到回包，权限撤销断开订阅。
- 数据年龄取关键源最老 age；>120s、断线或未知时显示“更新中断”或“更新时间未知”，禁用流动光点/跳动计数。不把生成的新包装时间当取数新鲜度，旧内容仅灰色标“上次快照”。
- 性能验收：同机同数据30轮开/关，`/state` 请求数与 Paperclip detail 调用计数不增加；p95增量≤max(20ms,基线5%)、首屏增量≤5%。开关关闭新增请求/对象/定时器为0。当前 C1 没有进行运行时性能测试。

## 8. 成本与质量上屏

卡片固定为“已确认成本 | 未返回用量的执行数 | 最后更新时间”，旁注未知成本运行数与总数；无确认成本显示“未知（NO_CONFIRMED_COST）”，不能显示 $0.00。部分已确认金额仅“小计”，不是任务总成本。币种不可混加，不从 spentMonthlyCents=0、model 配置、执行时长补价格。成本为0仅当确有计价记录明确金额0。

L0 的 115/633 为审计时点的缺 usage，不是当前实时数字，不填入 live KPI。本合成样例用3运行/1缺usage/3未知成本模拟两类缺口；confirmedRuns=0 表示已确认运行数量，没有用 confirmedAmount=0 冒充金额。

来源分层：当前 issue 状态=observed；done-rules 验证证据=validated；旧基线=legacy；部分/缺失=unknown；demo=synthetic。每源都标时间与范围完整性。样例故意180s过期展示更新中断。历史 source 名字只表示模拟了该源结构，并非已读取生产。

## 9. 模式与UI规格

| 模式 | 允许行为 | 第一版 |
|---|---|---|
| live | 显式授权当前公司只读数据，标更新时间；无权显示空状态 | 支持但默认关闭 |
| demo | 明确“合成演示”，固定场景，零凭据零业务写 | 默认入口选择；不得混入真实标题 |
| replay | 已保存历史，范围/播放时刻明确；不重放业务命令、不触发Agent | 后续另卡，不能承诺可恢复不存在的状态事件 |

双主题共布局与语义：浅色纸质背景 `#f4f6f8`、深色科技背景 `#101820`；正文强对比、边界低噪。绿只表示有效验收/恢复，琥珀等待决策，红明确失败，灰未知/失效，蓝执行；颜色必须附文字和图标，不靠闪烁。禁密集粒子、自动滚动抢焦点；减少动态效果和键盘阅读优先。

二维布局：顶部总览（范围/模式/成本/质量）；左任务队列（最多20可见行、筛选与下一处理人）；中三类关系分开切换；右执行详情（运行与版本证据摘要）；下时间线（分页，未知步骤显式缺口）。选中任务在三视图保持同ID、同版本、同等待原因。跳转采用入口枚举与服务端资源绑定，不能接受外部任意URL。

390px：顶部保留范围/模式/更新状态；队列、详情、时间线改标签切换，关系用列表，不缩小整张图；触摸目标≥44px，无文档水平滚动；长标签换行，开关/错误不遮挡操作。键盘Tab、Esc、焦点返回、ARIA名称齐全。桌面1440/1280/1024、平板768×1024另验收。

3D仅一块指挥中心摘要屏：3行“执行/待处理/数据更新时间”，缺值显示未知；点击打开二维面板。不在3D读小字，不新增high-frequency轮询；经注册口/独立模块接现有快照。app.js 修改须与小镇线明确互斥；不动已冻结角色、工位、路径。默认关闭对象/calls增量0，开启初定高档≤+4、低档≤+2 calls，超标降为静态文字；具体位置和预算由后续卡审批。

## 10. 隔离与验收门禁

独立配置 `command-view.json` 为未来提案，不在 C1 创建；仅 enabled===true 且服务身份范围验证通过才能live初始化。坏配置/缺失视为关闭。规划路由 `/command-view` 是候选，不是已存在接口；默认关闭时404，关闭时既有路由/body/header/页面保持逐字节不变（排除明确列出的挥发时间）。

禁止写 Paperclip、触发 Agent、发消息、变更审批、复用全局管理凭据作为用户身份。adapter只做字段白名单投影，响应无token/正文/内网地址。Live失败留空/上次失效快照，不能自动切demo掩盖故障。

后续测试清单：

1. 同任务队列/执行/摘要屏 taskId/company/subjectVersion一致，非同公司引用拒绝。
2. done/succeeded/PASS/legacy accepted、缺独立review、测试哈希变更、版本变化、非法验收人均不能显示已验收。
3. unknown成本null+原因，确认0有计价证据，多币种/部分计数不得求总。
4. stale/断线/未知年龄禁动画、标更新中断；缓存命中保持源时间。
5. 切公司清空UI与缓存，旧响应epoch丢弃；认证撤销失去后续访问。
6. current model与run model分开，NO_STATUS_TRANSITION不生成返工次数、阻塞时长或执行百分比。
7. 面板关闭/隐藏不取details；相同任务重复展开60s内单请求，最大4并发/5s/200项；故障只降级指挥视图。
8. `/state` 开关性能与请求计数对照；新视图不拥有第二transport，默认关闭零增量。
9. 双主题/五断点/ARIA/键盘/零横溢出/真实浏览器0应用错误；工作流跳转保持原有权限门禁。
10. 一项真实任务创建、领取、执行、验证、返工、验收全过程按实际证据展示；缺步骤明确待验证，不以演示代替验收。

## 11. 分期卡草案（每卡约1小时，前卡验收后开下一卡）

| 卡/执行者 | 允许文件草案 | 前置 | 验收 |
|---|---|---|---|
| C2 / 主线工程 | 新 `command-view-data.mjs`、对应tests | C1范围裁决 | 纯投影、全unknown/证据/范围测试；无请求 |
| C3 / 主线工程 | 新 `command-view-source.mjs`、tests；server.mjs只读薄钩子与新开关 | C2、授权范围、共享懒取数方案 | 404默认关闭、公司绑定、单飞/60s/4并发/性能、零写；server互斥 |
| C4 / 主线工程 | 新 `command-view.js`；ui.js/index.html≤10行钩子、tests | C3；确认标签页还是独立页 | 主页面遮罩消失、无错误条、console0；全真实浏览器 |
| C5 / UI工程 | 新指挥主题样式/页面、tests | C4布局冻结 | 双主题/390/768/1024/1280/1440与键盘可用 |
| C6 / Codex小镇线 | 新 `command-screen.js`、登记模块；必要独立钩子 | C5、注册口/位置审批、app.js独占 | 同源摘要、零新轮询、calls预算、不动角色/路径 |
| C7 / 主线工程 | 新demo fixtures、只读demo loader、tests | C2，可提前独立执行 | 合成ID/无凭据/未知与无证据边界，一项经历 |
| C8 / 主线工程 | 新replay reader/播放界面、tests | 董事会明确要replay，历史留存授权 | 不执行命令、无模型调用、来源缺口与播放时钟分离 |

第一版闭环不以完整动画为DoD：优先C2→C3→C4，选定项目与真实任务；若L2b未接线，验证/验收处必须停在待验证。C7可先展示设计但不是生产闭环证据。完整真实经历不足时，先交付可运行只读切片并列出缺步骤，不能伪造“完成第一版”。

## 12. 董事会待决定

1. 第一版选择哪个现有项目、哪一项真实任务及时间范围？谁负责授权和核对，是否允许该范围的只读历史采样？
2. 是否先仅live+demo、demo/空状态默认，replay不进入V1？
3. 二维入口选治理中心新增标签还是独立页面？推荐独立模块+治理最小入口，避免重排原面板。
4. L2b接线前是否隐藏 verifying/awaiting_acceptance/accepted阶段，仅保留“待验证（无证据）”？推荐隐藏未证实阶段，原生in_review仍可展示。
5. 指定验收人/预算授权人和合成样例审核人是谁？缺处理人时是否统一升级项目负责人？
6. 是否批准共享懒取数协调器以及公司/授权范围缓存键改造？这是C3必要前置，不能只把单公司缓存搬到多公司。
7. 当前成本源若仍不返回计价记录，是否同意确认金额/总金额都显示未知而非金额卡0？建议同意。
8. 3D摘要屏位置/注册口和calls预算何时批准？不影响二维只读首版。

## 13. 本次交付检查与限制

样例 `command-view-sample.json` 是明确脱敏的合成素材，全标识demo-*；没有真实标题/客户/正文/凭据，没有捏造验收证据。时间线包含设计用的synthetic领取/执行条目，只限demo；普通activity样式事件也全为合成，不能推断状态。

`command-view-checks.mjs` 仅读同目录JSON，校验v1顶层/指标null原因/允许阶段/证据/成本/敏感键值/合成ID/过期标记/部分集合；不发网络、不写文件。支持 `COMMAND_VIEW_CHECK_MUTATE=zerocost|fakeaccepted|leak|stale`，每项必须退出1，正常退出0。破坏在内存里，不更改样例。

此脚本不是生产权限网关、通用DLP或历史事实证明：无法仅靠JSON识别一个新客户的自然语言名称是否真实，也不能证明上游证据真实来源。生产必须用已授权源、最小字段投影、证据权威与人工脱敏审查；不能仅以“样例PASS”宣称live安全、性能或端到端已验收。

已有代码文件全部不修改；README追加文档索引。无服务/场景实现、无浏览器验收、无在线性能测试、无外部来源核验。需要董事会裁决后才能开始后续实施。

## 14. C1 实际验证记录

```text
node docs/command-view-checks.mjs
PASS CommandViewData v1
exit=0

COMMAND_VIEW_CHECK_MUTATE=zerocost
FAIL CommandViewData v1 mutation=zerocost
$.summary.cost.totalAmount:UNKNOWN_MUST_BE_NULL
summary.cost.totalAmount:UNKNOWN_MUST_BE_NULL
summary.cost.totalAmount:UNKNOWN_COST_MUST_BE_NULL
exit=1

COMMAND_VIEW_CHECK_MUTATE=fakeaccepted
FAIL CommandViewData v1 mutation=fakeaccepted
queue[0]:EVIDENCE_INTEGRITY_REQUIRED
queue[0]:NO_VALID_VERSIONED_EVIDENCE
exit=1

COMMAND_VIEW_CHECK_MUTATE=leak
FAIL CommandViewData v1 mutation=leak
$.queue[0].apiToken:SENSITIVE_KEY
$.queue[0].apiToken:UNKNOWN_KEY
exit=1

COMMAND_VIEW_CHECK_MUTATE=stale
FAIL CommandViewData v1 mutation=stale
quality.freshness:STALE_MARKER_MISMATCH
quality.freshness:STALE_LIVE_ILLUSION
exit=1

node --check docs/command-view-checks.mjs
exit=0

node --test tests/*.test.mjs
tests 770
pass 770
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 22393.1671
```

PowerShell 运行变异时逐项设置 `$env:COMMAND_VIEW_CHECK_MUTATE`，运行脚本并读 `$LASTEXITCODE`；结束后已删除该进程环境变量。四个FAIL均为预期拒绝，不是任务测试失败。另有临时只读内存断言验证：裸null、未知cost=0、81字标题、越项目引用、缺版本、隐藏源年龄均被拒绝；没有产生临时脚本/文件。

改动清单：仅新增本规划、217行检查脚本、97行JSON样例；README追加4行索引，追加前内容与备份一致。README备份在上一级 `office3d-backup-c1/README.md`，SHA-256：`71090DDD309D1323A9A12ED538B779B70EDFDC9A2E0DA87678C3F3570F0948C2`。不存在Git，未生成commit。

做到：规划十项、字段来源/未知/脱敏/缓存、四个负向变异、合成样例、分期卡与董事会待决定清单、全量回归通过。

没做到：未实现指挥视图、路由、开关或3D屏幕，这是本卡禁止实施的范围；未复用任何外部源码。

未验证：live真实任务的完整经历、真实证据来源与公司切换隔离、浏览器/性能/关闭态在线对比、外部产品源码及许可。没有调用可能带业务副作用的通用快照脚本；本次新增离线资料不接运行时。

停下等待董事会验收，不继续分期实施。
