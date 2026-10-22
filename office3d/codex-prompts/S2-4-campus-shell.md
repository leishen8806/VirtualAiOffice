# S2-4-campus-shell：仓配园区单体中心最小外壳、前广场、门楼与「模块注册口」（改 app.js，仅此一次，约 1.5 小时）

**执行者：Codex（新会话）。小镇线 · 场景。改 `app.js`（互斥：A4 已完成后才可开；与 O 系列的 `app.js` 卡轮流做）。** **董事会 2026-10-21 已确认四项取舍：完整园区 102×68 m；旧 28×12 外壳以后并入高位货架区作为内部模块（S2-9）；前广场 / 展示区 / 接待区这一期只做参观外观；旧址迁出后改绿化 / 活动草坪预留。按「智序小镇·DR 仓配服务中心概念图」执行。** **前置：S2-3 已验收（`CAMPUS / CAMPUS_BUILDING / CAMPUS_ZONES / CAMPUS_FLOWS / CAMPUS_FOCUS`）。** 先读：`_common.md`、`_lane-town.md`、**`docs\dr-campus-plan.md`（冻结基线）**、概念图 `E:\VirtualAIOffice\knowledge\项目\参考\智序小镇·DR仓配服务中心概念图.png`、`warehouse-shell.js`（薄件偏移 ≥ 0.12 m 的写法，S2-2b 的教训）、`app.js` 里前厅 / 广场 / 仓库外壳的搭建与 `mergeStatic / userData.dynamic` 约定、`quality.js`（只读）。

**允许修改：** 新增 `dr-campus-shell.js`、`dr-campus-registry.js`、`tests\dr-campus-shell.test.mjs`；`app.js`（**最小接线 ≤ 30 行，逐行列出**）；README 一节。**不要改** `server.mjs`、`ui.js`、`quality.js`、`merge.js`、`director.js`、`office-layout.js`（S2-3 已定稿）、`env.js`、`warehouse-shell.js`、`town\`。备份 `app.js` 到 `office3d-backup-s2-4`（**必须备份**）。

## 设计关键：模块注册口（让 S2-5…S2-8 不再碰 app.js）
`dr-campus-registry.js` 导出 `createCampusRegistry({ THREE, scene, quality, layout })` → `{ root, register(name, factory), buildAll(), dispose(), summary() }`：`factory({ THREE, root, layout, materials, collision, canvasTex })` 返回 `{ dispose() }`。`app.js` **只**创建注册表并调用 `buildAll()`，之后 S2-5 / S2-6 / S2-8 通过 `dr-campus-modules.js`（本卡创建，导出模块清单）登记自己的 factory，**不再修改 `app.js`**。注册表对每个 factory 做 `try/catch`：**单个模块出错只跳过该模块，不影响园区其余部分与主场景**。

## 要做的事
1. **开关**：开发期仅当 URL 含 `?campus=1` 时创建园区（默认不创建任何园区对象，**默认页面与改动前逐数据一致**）；是否改为默认开启由董事会在 S2-9 / O10 后决定。`app.js` 不得增加对 `/state` 的请求或任何轮询。
2. **外壳（只做最小可见体量，**简化、不做细节**）**：园区地面铺装（`CAMPUS` 外框，自带铺装平面，**前表面相对既有地面 ≥ 0.05 m 并加 `polygonOffset`，避免与环境地面 z-fighting**）；主建筑 `CAMPUS_BUILDING` 的外墙与屋顶（屋顶建议**半透明或分块 / 可见性分级**，保证俯视机位能看清内部分区；若用不透明屋顶，提供北侧「开顶」剖面或降低高度，**写明取舍**）；分区地面色块（`CAMPUS_ZONES` 的 14 区，按 `v1` 字段：`visible` 画体量，`mark` 只画地面标识，`reserved` 只留位）；前广场 `frontPlaza`：台阶、水景（静态蓝色平面 + 边缘，**不做水面动画**）、门牌「智序小镇 | DR 仓配服务中心（示意）」（Canvas 贴图，偏移 ≥ 0.12 m）；东南停车场车位线；物流出入口门架 + 斑马线标识；西路对侧斑马线与「园区方向（示意）」只作地面导视，**不创建路线或人物目的地**。命名 `campus-<part>`。
3. **与既有环境的冲突**：列出 `env.js` 在 `CAMPUS` 范围内生成的对象（树 / 路灯 / 城市建筑 / 铺装），**只在 `?campus=1` 时用「按名称或位置隐藏」的方式处理**（不得改 `env.js`，不得改变随机数消费顺序），并在汇报里**逐项列出**被隐藏的对象数量与种类，供 S2-9 正式迁移。
4. **预算（相对默认同机位同画质，`?campus=1` 开启后在园区机位测量）：高档 ≤ +4 calls、低档 ≤ +1 call；不新增光源；静态件不标 `userData.dynamic`**。
5. **碰撞**：本卡不新增人物路线、目的地与碰撞注册（人物不去园区）；园区几何不得与办公室 / 广场 / 前厅的碰撞体或人物路线重叠（用 S2-3 常量做断言）。

## 测试与验收
- 纯数据：`buildCampusShellSpec(layout)` 生成部件清单（名称、外框、是否 dynamic、偏移），断言：全部部件在 `CAMPUS` 内、无 `dynamic`、薄件偏移 ≥ 0.12 m（地面铺装 ≥ 0.05 m）、`reserved` 区不生成体量；注册表单模块抛错不影响其它模块（用假 factory 测）；`app.js` 新增 ≤ 30 行且不含 `fetch( / innerHTML / eval`。
- 浏览器（页面聚焦，Playwright）：默认页面与改动前**逐数据一致**；`?campus=1`：广场远望、园区俯视、斜 45°、前广场近景、物流门近景各一张（深浅主题各一组）；成对 calls（高 / 低）；**同机位 5 秒帧序列像素差证明无 z-fighting / 闪烁**；控制台 0 错误；办公区、广场、25 人路线、小橘不受影响（跑 T16b 200 种子仍全过）。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；**逐行列出 `app.js` 接线**；列出被隐藏的环境对象清单。**不要自己重启服务。**
