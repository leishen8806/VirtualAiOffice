# V3-A2P 独立样板交接

本卡基于 `345cd39f7dddebf4e4e61e146af7a283cd415088`，不接主场景、不引入 `LAYOUT_V3_ALIGN`。预览入口：`office-vis2-preview.html?islandFixture=align&q=high`，亦支持 `q=low`。

## 吧岛合同

- `barSpec(layout)` 增加 `counterRadius = island.barOuter ?? bar.radius` 与 `collisionRadius = bar.radius`；原 `radius` 别名保留，避免破坏共享调用方。
- 台身/品牌跟随台身半径；碰撞与东西开口跟随碰撞半径。现有台面保留 45mm 外挑。
- 兼容界限：两半径相同时，保留旧 V3 实际 4.4m 吧凳与 5.25m 沙发，保证旧数组逐字节不变。两半径不同（方案甲 3.5 / 6m）时，优先使用 `bar.seats` 的坐标和 ID；缺席位数据才按 `island.stoolRadius` 生成。沙发使用 `island.sofaOuter`。不新增布局字段或主线开关。
- 方案甲夹具直接复制旧 V3 并仅改 `bar.radius=6`、`island.barOuter=3.5`；原 `bar.seats` 有 0.1m 坐标取整，因此其实际半径约 4.2m 而非强行投影到圆上。所有高低档明确席位均保留，不因低档丢身份。
- 榕树、树池不改；既有角色导航仍使用共享的原座位函数。新 6m 碰撞包络**尚未接入真人路径**，须由后续 V3-A1 汇合和路线验收确认，不能用本卡旧 V3 的路线通过代替。

## 开放岛陈设合同

`buildOpenFurnishing({ THREE, root, area, workstations, corridors, low, assets })` 使用现有 `createSampleBatch`，返回 `placements / colliders / corridors / skipped / summary / dispose`。不注册碰撞或创建工位。`dispose` 只释放新增几何、材质，不释放传入共享贴图。

- `area` / `corridors` 为 `{x0,x1,z0,z1}`，每条通道最小宽度 1.2m。
- 工位参数为 `{x,z,radius}`；`radius` 是工位实体/座椅保留半径，陈设与其再留 0.6m。夹具使用半径 1m，即总排除半径 1.6m。
- 方案甲的外框与六工位来自 `plan/v3-layout-align @ 83ecc1b`；陈设布局和两条 1.4m 通道是本卡预览建议，未冒充规划原文或最终导航。
- 确定性逐格放置 2 长桌、3 矮柜、4 绿植、3 矮隔断；保持陈设间至少 1.2m，不足空间会列入 `skipped`，不挤占必留区。
- `placements[].bounds` / `colliders` 覆盖实际几何含把手；`vertices` 指向合批中的顶点范围，供独立测量。输出无 Agent 绑定、热点或业务字段。
- 预览中的六张灰桌与圆形保留区只是示意占位，不是本模块新增的真实工位；绿色横纵条表示保留通道。

后续接线由集成人完成：使用通过验收的 `LAYOUT_V3_ALIGN` 输入，消除原有对应装饰，注册一次新占地，复核新布局路线。本卡没有修改这些共享文件。
