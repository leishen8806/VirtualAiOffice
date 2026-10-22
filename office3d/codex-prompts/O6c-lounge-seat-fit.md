# O6c-lounge-seat-fit：吧岛沙发与人物坐姿对不上（腿穿沙发）——沙发几何按「坐椅动作」校准（Trae；小卡，约 1 小时）

**执行者：Trae（办公区产线；只改自己的 `office-bar.js` / `office-bar-geometry.js` 及其测试、预览页；不改 `app.js`、`people.js`、`office-layout.js`）。** **董事会 2026-10-22 反馈（两张截图）：办公区中间圆形吧岛旁，人物坐在沙发上时姿态不对——髋部陷进座面、小腿穿过沙发前立面露在下面。**

## 根因（我读代码得出，请你用实测确认）
- 沙发是实心方块：`office-bar.js` 里 `box(seat.x, .36, seat.z, 1.35, .52, .8, …)`（座面顶约 **0.62 m**、座深 **0.8 m**、立面从地面实心到座面）+ 靠背 `.13` 厚。
- 真人休息用 `people.js` 的 `lounge: ['sit_chair_idle_relaxed_01', 'sit_chair_idle_neutral_01']`——**「坐椅子」动捕动作**，髋部高度与小腿向前伸出的距离是固定的（约一把椅子：座面 0.45 m 上下，膝盖向前约 0.4–0.5 m）。人物被放在座位点 `(x, z, yaw)`（`barLounges(layout)` 的 `x / z / yaw`），**没有座高 / 前后偏移**。
- 所以：座面比髋部高 → 人陷进去；座深 0.8 且前立面实心 → 小腿正好穿过前立面。

## 要做的事
1. **先实测，不要猜（必须）：** 写一个只读的校准脚本 / 临时预览页，用 `people.js` 里**真实的人物与 `sit_chair_idle_relaxed_01` 动作**，把人物放在原点朝 +z，读出**髋骨 / 膝 / 脚**的世界坐标：得到「坐下后髋部离地高度 `hipY`」「膝盖向前最远距离 `kneeZ`」「脚底向前距离 `footZ`」。（不要改 `people.js`。）把测得的数值与方法写进报告与 `office-bar-geometry.js` 的注释。
2. **导出单一数据源 `LOUNGE_SIT`（`office-bar-geometry.js`）：** `{ seatTop, seatDepth, legRoom, hipForward, hipLift }`，由第 1 步实测推出：`seatTop ≈ hipY − 0.08`（软垫压缩量）、`seatDepth` 使座面前沿落在膝盖之后、**前立面不得挡住小腿**（座下留出腿部空间：立面下缘镂空或整体后缩，或沙发做成「坐垫 + 底座后缩 + 细脚」结构）、`hipForward / hipLift` = 人物相对座位点应偏移的前后 / 抬升量。**`barLounges(layout)` 每个座位增加 `sitOffset: { forward, lift }` 字段**（不改已有字段 `x / z / yaw / appX / appZ / angle`，现有测试不得改断言）。
3. **沙发几何按 `LOUNGE_SIT` 重做（高 / 低档都要）：** 座面顶高 = `seatTop`；座深 / 靠背 / 扶手与 `LOUNGE_SIT` 一致；前立面不挡腿；**三角形与 calls 不超过 O6b 验收时的读数（高档 3 calls / 4,880 三角形，低档 1 / 1,712），超出按「扶手细节 → 底座线脚」降级并如实写出**；O6b 的 `materialOverrides / uvScale` 口保持不变。
4. **验证（必做，不是单测就行）：** 预览页新增「放一个坐着的真人」开关（用真实 `people.js` 人物与 `lounge` 动作放到每个沙发座位，应用 `sitOffset`）；截图 **3 个角度（前上方、侧面、正前）× 高 / 低档**，**确认：髋部落在座面上、大腿贴合座面、小腿在沙发前方自然下垂、脚踩地面、不穿过立面、不悬空**。同一场景再用两种体型 / 性别的人物各一张。
5. **测试：** `LOUNGE_SIT` 数值自洽（`seatTop` 与实测 `hipY` 的差在 0.05–0.12 m；`seatDepth + 前缘` 小于 `kneeZ`）；`barLounges` 新字段存在且 `x/z/yaw` 不变；沙发网格最大高度 = `seatTop` 与靠背高的关系；默认行为不变；全量 `node --max-old-space-size=2048 --test --test-timeout=60000` 全过，不放宽断言。
6. **不要做**：不改人物动作 / 骨骼、不加新坐姿动画、不改 `app.js`（应用 `sitOffset` 的 ≤5 行钩子由我另派 Codex 会话一，`O6d`，在你通过验收后）。备份改动文件到上一级目录 `office3d-backup-o6c`；不读取或打印密钥，不重启服务。「做到 / 没做到 / 未验证」，贴实测的 `hipY / kneeZ / footZ`、`LOUNGE_SIT` 数值、六张截图；**停下等我验收**。

**后续：** rev3 的吧岛沙发（R3-4A）沿用 `LOUNGE_SIT` 与同一套校准方法。
