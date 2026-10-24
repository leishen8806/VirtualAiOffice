---
id: OF-R1
base: integration/office-evidence-20261023 @ 1bf9ec9372b73fccc0e50fc6730689c0b3a420f0
branch: integration/office-evidence-20261023
scope:
  - office3d/director.js
  - office3d/office-layout.js
  - office3d/office-v3-public-path.js
  - office3d/office-v2-modules.js
  - office3d/office-v3-modules.js
  - office3d/app.js
  - office3d/office-vis2/
  - office3d/tests/
  - office3d/docs/
  - dispatch/codex/outbox/OF-R1-report.md
budget: 6h
---
# OF-R1：整楼细化分支以 O-06 FIX3 为导航基线 + 路线错误不再被吞 + 广场低画质档

在 `integration/office-evidence-20261023` 上从 `1bf9ec9` **继续追加提交**（合入用 merge 提交，不 rebase），不改写已审提交、不 force push、不推 `main`。

## Q-V1 代码检查结论（1bf9ec9）

本批（董事会已批准）只做了代码检查，视觉、性能未验证。

已确认、请保留：
- V2、V3 各 25 个工位的名称、坐标、朝向与房间区域，与 `34af63a` 逐字相同；
- 默认布局不受影响（新分支以 `?layout=3` 或样板开关为条件；`officeWarm`、`warmPalette` 默认关闭；V2 会议家具与屏幕位置保留原值）；
- 22 个 `office-*` 测试共 149 项，失败 4 项均为基线既有（环境缺旧备份文件）。

作为集成候选未通过，原因如下。

## 要做

1. **O-06 基线（P1）**：本分支带入的 O-06 是 FIX1（与 `fix/vis3-m1-o06` 上 `ceda00d`、`14da015` 补丁相同）。`14da015` 此前审查发现 V3 上下班 TypeError 回归，修正它的 FIX2 `dd1226a` 与 FIX3 `0c266d5` 不在本分支。请合入 `origin/fix/vis3-m1-o06`（头部 `0c266d54ba74c39cf5a47f7e124665221fb7ae0d`），解决冲突。
2. **`director.js` 合并（P1/P2）**：本分支在上下班、事件、出行路线外包了 `try/catch`，出错只 `console.warn` 并返回 false，人物停在原地、不再报错；这与 FIX2/FIX3 对同一批函数的改法冲突。合并要求：
   - 保留 FIX3 的语义：`navigation` 注入、`boardTrip`、访客排队"到点即入队"、坏路线**一次性**回收（`invalidRoute`），不得退回逐帧重试；
   - 保留本分支的家具绕行（`furnitureRoute`），但 `try/catch` 只用于明确的"家具阻塞"错误类型；其它异常（例如 TypeError）不得被吞掉；
   - O-06 由 Trae 持有，合并后的 `director.js` 在报告中逐段说明取舍，复审时会同时对照 FIX3。
3. **导航合同测试（P1）**：合并后 FIX3 的 `tests/office-v3-meeting-navigation.test.mjs` 必须全部通过。审查员把该文件（`0c266d5` 版本）放到 `1bf9ec9` 上运行：11 项失败 6 项，其中两条是行为信号，必须查清：
   - 休息区路线由 `office-v3-public-path.js` 抛出 `V3 public route endpoint blocked`（起点 x 22.25, z −7 → 终点 x 6.7, z −6），确认东侧会议通道到休息区是否被公共通道规划误判为阻塞；
   - 访客排队路径 `TypeError: Cannot read properties of undefined (reading 'desk')`。
   
   另加一条测试：V3 下 25 个工位依次上班、下班全部成功，过程中没有 `[director]` 警告。
4. **开关范围说明（P3）**：交付称本批为"opt-in / gated"，但旧西翼会议家具不构建、工位桌改由 `furniture3` 提供、V3 导航换成公共通道路线，只要 `?layout=3` 就生效，与样板开关 `OFFICE_SAMPLE_MODE` 无关。在 `docs/office-sample-integration.md` 写清两层开关各自影响的范围。
5. **广场低画质档（P2，来自 O-V2 `63f2568` 代码核查）**：`office-vis2/completion.js` 调用 `appendOfficePlaza({ THREE, batch, layout })` 不传 `low`；`plaza.js` 复用的共享构件始终按高画质原型构建，花带叶片固定 24×5 个。结果低档三角形增量（+5,824）反而比高档（+4,384）多。把 `low` 传到 `appendOfficePlaza` 再传给 `buildOfficePlazaProps`；花带叶片在低档减少；测试断言低档三角形少于高档。
6. **共享伞盖朝向（协调项）**：Trae 的卡 `W-V1-R2` 会修正共享模块 `office-plaza-props.js` 中伞盖开口朝上的问题。届时本分支 `plaza.js` 里对伞盖的私有翻转必须去掉，否则会翻回去。若 Trae 的修正已合入你的基线，就在本卡一并去掉；否则在报告里注明待办。

## 不做

不改 V2 / V3 工位名称、坐标、朝向与房间区域；不改业务映射、Paperclip 接口、仓配与二维中控台；不合并 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 报告 `dispatch/codex/outbox/OF-R1-report.md`（放工作分支）：做到 / 没做到 / 未验证；合并冲突逐文件说明（`director.js`、`office-layout.js` 逐段取舍）；第 3 条两个行为信号的原因与处理；改动文件与行数。
- 测试（带资源上限，本机内存紧张时只跑定向）：
  - 定向 `node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs tests/director*.test.mjs`；
  - 全量 `tests/*.test.mjs` 仅在空闲内存充足时运行，否则在报告中写 `NOT_RUN` 及原因；
  - 失败按名称与 `1bf9ec9` 比较，不得新增。
- 截图（如有条件）：`?layout=3` 默认与打开样板两种状态的办公全貌，同机位与 `1bf9ec9` 成对。
- 完成后停下，等待 Q-V1 独立复审。
