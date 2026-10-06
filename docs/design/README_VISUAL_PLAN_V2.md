# README 视觉计划 V2（README Visual Plan V2）

- 产品：**Virtual AI Office / 智序工场**
- 状态：**计划冻结稿（仅文档）**；不替换任何图片、不删除任何 Legacy 资产、不修改 README
- 上游：`VISUAL_IDENTITY_V2.md`（调色板、避免项、资产命名与原创 / 真实性规则）、`CHARACTER_SYSTEM_V1.md`、`UI_PROTOTYPE_CONTRACT_V2.md`

## 1. 目标

**README 首屏不再在视觉上像 Legacy NiuMa Studio。** 文字品牌已迁移，但 README 的第一张图仍是旧产品的二次元演示动图，第二张是五套动漫皮肤合集——访客看到的仍是旧产品的视觉身份。本计划规定：新的视觉序列、旧图的去留、以及 7 张新品牌资产的精确规格。

## 2. 现有 README 图片审计（实测）

README 当前引用了 5 个图像 / 视频资源（另有 1 个未被引用的旧动图）：

| 资源 | 大小 | README 位置 | 内容 | 分类 | 处理 |
| --- | --- | --- | --- | --- | --- |
| `docs/demo-anime.gif` | 3.9 MB | 第 7 行，**首屏第一张图**（alt：“智序工场演示”） | Legacy 二次元办公室演示动图 | **LEGACY_VISUAL** | **从 README 首屏替换**（换成新的 Hero）；原文件**保留不删**，降级到文末“经典主题”小节 |
| `docs/skins.png` | 1.0 MB | 第 11 行，首屏第二张图（五套二次元皮肤合集） | 樱花 / 夜班 / 赛博霓虹 / 猫耳咖啡 / 像素复古 | **KEEP_BUT_DEMOTE** | 移到文末“经典主题（Classic Themes）”小节；不再出现在首屏 |
| `docs/niuma-demo.mp4`、`docs/niuma-demo-2k.mp4` | 7.7 MB / 12.2 MB | 第 13 行，演示视频链接（1080p / 2K，像素版） | Legacy 像素版演示视频，**文件名含 `niuma`** | **LEGACY_VISUAL** | 链接降级到“经典主题”小节，文案标注“Legacy 像素版演示”；新视频就绪后首屏改用 `virtual-ai-office-demo.mp4`；文件名保持不变（改名会破坏已有链接，属于单独任务） |
| `docs/setup.png` | 0.19 MB | 第 59 行，“接入员工：点一下就连上” | Legacy 界面中的“接入员工”面板截图 | **REPLACE（新界面实现之后）** | 在新界面实现并重新截图之前**保留**（它描述真实功能）；alt 文本标注为 Legacy 界面；新界面落地后用 Core 主题截图替换 |
| `docs/skin-editor.png` | 0.41 MB | 第 235 行，“自己做皮肤”小节 | Legacy 皮肤编辑器截图 | **KEEP_BUT_DEMOTE**（除非编辑器本身被重新设计） | 该小节属于“经典主题”，保持在文末 |
| `docs/demo.gif` | 1.2 MB | **未被 README 引用** | Legacy 旧演示动图（孤儿） | **LEGACY_VISUAL** | 不引用、不删除；保留 |

另：`docs/skins/*.json`（`minimal`、`snow-night`、`template`）是**主题数据文件**，不是图片，不在本计划范围内，保持不变。

这些 Legacy 资产**可以为兼容与历史而继续留在仓库里**，但**不得定义 Virtual AI Office 的首屏身份**。

**结论**：首屏的两张图（`demo-anime.gif`、`skins.png`）都必须替换 / 降级；其余按真实性规则处理。

## 3. 新的 README 视觉序列

README 顶部到底部的顺序（现有文字章节保留，位置按下表调整，**本计划不改写任何文字内容**）：

| 序 | 区块 | 资产 | 放置位置（对应现有 README） | 作用 |
| --- | --- | --- | --- | --- |
| 1 | **Hero（英雄图）** | `docs/brand/hero-office.png` | 标题 `# 智序工场 · Virtual AI Office` 之后、第一段文字之前（取代 `demo-anime.gif`） | 第一印象：一间由人类与 AI 共同运转的数字化办公室 |
| 2 | **产品总览** | `docs/brand/office-overview.png` | 紧接第一段介绍（取代 `skins.png` 的位置） | 解释办公室里有什么：角色、任务、状态、证据、审批 |
| 3 | **工作生命周期** | `docs/brand/workflow.png` | “一个需求是怎么被做完的”小节开头 | 从需求到交付的路径，突出“证据决定完成” |
| 4 | **角色阵容** | `docs/brand/role-lineup.png` | “公司架构 / 员工 = skill”小节开头（并在首次提到角色时引用） | 8 个官方角色；强调角色 ≠ 模型 |
| 5 | **人类 + AI 协作** | `docs/brand/human-ai.png` | “亮点”小节之后（或“全自动与安全”之前） | Human / Agent 徽章、Waiting Human、审批 |
| 6 | **真实界面** | `docs/brand/dashboard.png`、`docs/brand/coordinator.png` | “在网页里怎么用”小节 | 真实 UI 截图（见 §5 的真实性规则） |
| 7 | **工具与执行** | 现有“工具柜 = 插件”小节；`setup.png`（待替换） | “工具柜 = 插件”与“接入员工”小节 | 工具与执行器，沿用文字说明；图为真实界面 |
| 8 | **经典主题（Legacy / Classic Themes）** | `skins.png`、`demo-anime.gif`、`skin-editor.png`、Legacy 演示视频链接 | **文末**（现有“皮肤”“自己做皮肤”小节），小节标题改为“经典主题 / Classic Themes” | 保留旧主题，**只放在底部**，明确是可选外观 |

**V2 之后的 README 首屏只包含新品牌视觉资产**（Hero、产品总览）；Legacy 资产（`demo-anime.gif`、`skins.png`、`niuma-demo*.mp4`、`skin-editor.png`）只出现在文末“经典主题 / Classic Themes”小节。

首屏验收：打开 README 的前两屏，**看不到**二次元角色、粉色主色、猫耳、旧人设；能看到新的 Hero、产品名“智序工场 · Virtual AI Office”和 Helix（System Orchestrator）。

## 4. 新品牌资产契约（`docs/brand/`）

所有资产的通用规则：

- 视觉语言：`智序 · Core`（深色为主，见 `VISUAL_IDENTITY_V2.md`）；角色来自 `CHARACTER_SYSTEM_V1.md`；
- **ROLE ≠ MODEL**：任何图里都不得出现“模型 = 人物”；模型只以中性药丸出现；
- **文字**：中文为主，英文为副；不使用虚构的数据冒充真实运行；
- **格式**：PNG（sRGB，无损），文件 ≤ 600 KB（超过则优化 / 分层压缩）；同时提供 `@2x`（尺寸 ×2）与 `-light` 浅色版（预留文件名，见 §6）；
- **alt 文本**：中文为主、英文为辅，描述内容；概念图须含“（概念图）/ concept”；
- **文件名**：小写、短横线；**不得包含** `niuma`、`牛马`、`shaniu`、`傻妞`；
- **来源与授权**：每张图在交付时附“来源 / 授权”记录（`docs/brand/ASSET_LEDGER.md`，由实现阶段创建）。

### 4.1 `docs/brand/hero-office.png`

| 项 | 规格 |
| --- | --- |
| 目的 | README 第一印象；建立“有秩序的数字化办公室”的品牌身份 |
| 画幅 / 尺寸 | **16:9**，1600×900（`@2x` 3200×1800） |
| 构图 | 等距 2.5D 办公室全景，**Helix 位于画面中心偏上，其余 7 个官方角色围绕 Helix 呈环形 / 分区排列**（官方阵容共 **8 个角色，含 Helix**，画面中不得出现第 9 个官方角色）；座位间有细连线；右前方有一块 Human 区（含一个琥珀色 Human Action 标记；该区里的**通用座位**——例如 Workspace Owner——不属于官方 8 个角色）；背景为 `--canvas-floor` + 等距网格；左上留出字标空间 |
| 可见文字 | 左上字标：`智序工场`（主）/ `Virtual AI Office`（副）；一行标语（中）：“人类与 AI，同在一间有秩序的办公室。”；不出现任何其它文字 |
| 视觉状态 | 混合：Helix THINKING、2 个 WORKING、1 个 REVIEWING、1 个 WAITING_HUMAN、1 个 DONE、其余 IDLE（演示状态语言；**不得**出现 BLOCKED 以外的“故障感”元素喧宾夺主） |
| 必需角色 | **全部 8 个官方角色，含 Helix**（即 Helix + 其余 7 个，总数恰为 8）；其中至少 1 个人类座位（圆形 HUMAN 徽章）与 2 个 AI 座位（六边形 + 模型药丸，模型名中性：`Claude`、`Codex`） |
| README 位置 | 序 1：标题之后、第一段文字之前 |

### 4.2 `docs/brand/office-overview.png`

| 项 | 规格 |
| --- | --- |
| 目的 | 解释“办公室里有什么”：角色、成员、任务、状态、证据、审批 |
| 画幅 / 尺寸 | **16:10**，1600×1000 |
| 构图 | 办公室画布的局部放大 + 6 个编号标注（①角色 ②成员徽章 ③任务卡 ④依赖线 ⑤证据芯片 ⑥Human Action），标注线与图例位于画布外侧 |
| 可见文字 | 6 个标注的中文名称 + 英文副标（如“① 角色 Role”）；任务卡示例 ID 使用 `TASK-213` 风格的示例；底部一行图例：状态环含义 |
| 视觉状态 | 至少展示 WORKING、REVIEWING、WAITING_HUMAN、BLOCKED（红色依赖节点）、DONE（证据 ✓）各一个 |
| 必需角色 | 至少 4 个：产品经理、后端、QA、审查员 |
| README 位置 | 序 2：第一段介绍之后 |

### 4.3 `docs/brand/workflow.png`

| 项 | 规格 |
| --- | --- |
| 目的 | 展示从需求到完成的路径，强调**由证据决定完成**与人类参与点 |
| 画幅 / 尺寸 | **2:1**，1600×800 |
| 构图 | 自左向右的流程带：需求 → Helix 规划 → （Gate 1：人类审批）→ 执行 → 评审 / 测试 → 证据 → （人类验收）→ 完成；每一步下方是对应角色的小形象；返工回路以箭头表示；“证据”节点高亮 |
| 可见文字 | 每步中文名 + 英文副标；节点标注“Human”的步骤带圆形 HUMAN 徽章；底部一行：“完成由证据判定 · Done is decided by evidence” |
| 视觉状态 | 流程中每个节点以其典型状态呈现（规划 THINKING、执行 WORKING、评审 REVIEWING、人类审批 WAITING_HUMAN、完成 DONE） |
| 必需角色 | Helix、产品经理、后端 / 前端（二选一或都要）、QA、审查员 |
| README 位置 | 序 3：“一个需求是怎么被做完的”开头 |

### 4.4 `docs/brand/role-lineup.png`

| 项 | 规格 |
| --- | --- |
| 目的 | 展示 8 个官方角色，建立“角色 ≠ 模型”的认知 |
| 画幅 / 尺寸 | **3:1**，1800×600 |
| 构图 | 一排 8 个角色（等比、等间距、同一地平线），每个角色下方是铭牌（中文角色名 + 英文）与角色色条；每个角色旁有各自的**标志性配饰**；最下方一行小字说明徽章含义 |
| 可见文字 | 8 个角色的名称（中文为主，英文为副标）；说明行：“角色是职责，模型只是徽章 · Roles are responsibilities; models are badges.” |
| 视觉状态 | 全部 IDLE（统一，便于比较轮廓）；右下角用 3 个小示例展示同一角色（后端）分别带 `Codex`、`DeepSeek`、人类圆形徽章，形象不变 |
| 必需角色 | **全部 8 个**：Helix、Product Manager、Architect、Frontend Engineer、Backend Engineer、QA Engineer、Reviewer、Documentation Specialist |
| README 位置 | 序 4：角色 / 员工小节开头 |

### 4.5 `docs/brand/human-ai.png`

| 项 | 规格 |
| --- | --- |
| 目的 | 展示人类与 AI 在同一组织模型里协作：成员徽章、Waiting Human、审批 |
| 画幅 / 尺寸 | **16:9**，1600×900 |
| 构图 | 左半：人类成员（圆形 HUMAN 徽章；示例角色：`Workspace Owner`、`Product Manager`，不使用任何真实人名；如显示通道标记，只用中性的“通道”小图标并标注“规划中 / planned”）；右半：AI 成员（六边形 AI 徽章 + 中性模型药丸）；中间：一张 Human Action 卡片（“需要：产品经理 · 等待回复”）与一条从 Helix 到卡片的连线；下方：一条小时间线（请求 → 答复 → 证据 → 完成） |
| 可见文字 | 分区标题“人类成员 Human Members”“AI Agent AI Agents”；卡片文字：“需要你的确认”；时间线 4 个节点的短标签；不出现任何虚构的聊天内容全文 |
| 视觉状态 | 1 个 WAITING_HUMAN（琥珀）、1 个 DONE（绿）、其余 IDLE / WORKING |
| 必需角色 | 产品经理（人类）、Helix、1 个 AI 工程师角色、审查员 |
| README 位置 | 序 5：“亮点”之后；**图中的 Human Action / 人类交接是计划中的产品方向（FORWARD-LOOKING），不得被描述为已实现能力** |

### 4.6 `docs/brand/dashboard.png`

| 项 | 规格 |
| --- | --- |
| 目的 | 真实界面：项目看板 / 办公室页 |
| 画幅 / 尺寸 | **16:10**，1600×1000（截图按 2× 设备像素比捕获后缩放） |
| 构图 | **已实现的** Core 主题界面的**真实截图**：全局栏 + 组织轨 + 办公室画布 + 协调器面板四区同屏，浏览器 / 窗口外框裁掉 |
| 可见文字 | 界面真实文字（中文）；示例项目名与任务名为演示数据，须与“演示数据”标记同屏或在说明里声明 |
| 视觉状态 | 运行中的示例场景：至少含 WORKING、WAITING_HUMAN、DONE 与一条依赖边 |
| 必需角色 | 至少 5 个座位可见 |
| 真实性 | **必须是真实 UI 截图**。界面实现前，本资产**不得**以插画冒充；可先以“概念图”形式占位并在 alt 与说明里明确标注 |
| README 位置 | 序 6：“在网页里怎么用”小节开头 |

### 4.7 `docs/brand/coordinator.png`

| 项 | 规格 |
| --- | --- |
| 目的 | **主体是 Helix**：展示 Helix 面板——对话、编排状态、重要决定、Waiting Human、最近活动 |
| 画幅 / 尺寸 | **4:5**，1200×1500（面板竖向裁切） |
| 构图 | 协调器面板（Coordinator Panel）的真实截图（同 §4.6 的真实性规则）；顶部是 Helix 形象，名称 `Helix`，副标题 `System Orchestrator`（中文界面 `系统编排中枢`），并显示当前状态（Planning / Dispatching / Waiting Human / Reviewing / Completed）。文件名 `coordinator.png` 沿用原资产契约的结构性名称；**图中可见的名称一律是 Helix** |
| 可见文字 | 面板真实文字；示例对话（中文）不得包含旧品牌词或旧人设称呼 |
| 视觉状态 | 一次编排进行中：计划已生成、1 个 Waiting Human 请求、最近活动 3–5 条 |
| 必需角色 | Helix（头部形象）；引用的角色以铭牌小图出现 |
| README 位置 | 序 6：与 `dashboard.png` 并列（“在网页里怎么用”） |

## 5. 预留的未来资产

| 文件 | 规格 | 说明 |
| --- | --- | --- |
| `docs/brand/demo-core.gif` | **16:9**，1280×720，12–20 秒循环，≤ 8 MB，≤ 15 fps 起步 | 取自**真实**界面（`UI_PROTOTYPE_CONTRACT_V2.md` 的场景 S04–S11 片段）；用于 README 序 1 或序 6 的动图补充 |
| `docs/brand/virtual-ai-office-demo.mp4` | **16:9**，1920×1080，H.264，≤ 90 秒，≤ 30 MB，带中英文字幕 | 完整演示（场景 S01–S15）；README 以文字链接引用；取代指向 `niuma-demo*.mp4` 的首屏链接（旧视频降级到“经典主题”小节） |
| `docs/brand/*-light.png`、`*@2x.png` | 同上述规格 | 浅色与高倍率版本；README 可用 GitHub 的 `<picture>` + `prefers-color-scheme` 切换 |
| `docs/brand/ASSET_LEDGER.md` | 表格：文件、用途、来源（原创 / 授权）、作者、日期、授权说明 | 满足“原创或明确授权”规则 |

**命名规则（所有新资产）**：不得包含 `niuma`、`牛马`、`shaniu`、`傻妞`（大小写不敏感）。建议在实现阶段把这条规则加入品牌守卫测试（扫描 `docs/brand/` 文件名）。

## 6. 真实性与诚实规则

1. 描绘**产品界面**的图（`dashboard.png`、`coordinator.png`、`demo-core.gif`、演示视频）必须是**已实现界面**的真实捕获。
2. 在界面实现之前，用于占位的概念图必须在文件说明、alt 文本与 README 附近的说明里**标注为概念图**。
3. 插画类资产（Hero、总览、流程、角色阵容、人类 + AI）是**示意图**，不得被描述为真实运行截图；其中的数据（任务 ID、成员名）是示例。
4. 不使用厂商 logo；模型只用中性文字药丸。
5. 不展示未实现的能力（例如在 Telegram Human Gateway 尚未实现时，`human-ai.png` 的通道标记必须标注为“规划中 / planned”，或不出现）。

## 7. 实施顺序（README）

| 阶段 | 内容 | 前置条件 |
| --- | --- | --- |
| R0（现在） | 本计划（文档）冻结 | — |
| R1 | 制作 §4.1–4.5 的五张**示意图**与 `ASSET_LEDGER.md`；README 首屏改用 Hero 与总览，`demo-anime.gif` 与 `skins.png` 降级到文末“经典主题” | 角色系统定稿；插画制作方式与授权确定（`VISUAL_IDENTITY_V2.md` V2） |
| R2 | 界面实现并通过原型 / 实现验收后，捕获 `dashboard.png`、`coordinator.png`、`demo-core.gif`；用新界面截图替换 `setup.png` | Core 主题界面已实现 |
| R3 | 录制 `virtual-ai-office-demo.mp4`；README 首屏的视频链接改为新视频；旧 `niuma-demo*.mp4` 降级 | 完整界面可运行 |
| R4 | 品牌守卫扩展：README 首屏不得引用 Legacy 资产；`docs/brand/` 文件名检查 | R1–R3 完成 |

**本计划不删除任何 Legacy 资产**：`demo-anime.gif`、`demo.gif`、`skins.png`、`setup.png`、`skin-editor.png`、`niuma-demo.mp4`、`niuma-demo-2k.mp4` 全部保留在原位置、原文件名；资产改名属于单独的、需要处理已有链接的任务。

## 8. 评审清单

1. README 的前两屏没有 Legacy 视觉（无动漫角色、无猫耳、无粉色主色、无旧人设）；
2. 8 张图的顺序、位置与 §3 一致；
3. 7 张新资产的规格（画幅、尺寸、文字、状态、角色、位置）齐全且可执行；
4. 没有任何新资产名称含 `niuma / 牛马 / shaniu / 傻妞`；
5. 真实性规则被遵守（UI 图为真实截图或明确标注为概念图）；
6. Legacy 资产全部保留，且只出现在文末“经典主题”小节；
7. ROLE ≠ MODEL 在所有图中成立。

## 9. 待决事项

| # | 问题 | 决定时机 |
| --- | --- | --- |
| R-1 | 示意图的制作方式与授权记录（同 `VISUAL_IDENTITY_V2.md` V2） | R1 之前 |
| R-2 | README 是否使用 `<picture>` 提供深浅色两套资产 | R1 |
| R-3 | 是否在 `docs/brand/` 之外增设官网资源目录 | 官网立项时 |
| R-4 | Legacy 演示视频的文件名（含 `niuma`）是否在迁移期之后改名并保留重定向 | 单独的资产改名任务 |
