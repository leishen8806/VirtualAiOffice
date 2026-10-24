---
id: W-V1-R2
base: integration/vis2-dr-rc1 @ b0d4c74f3632c6d8b2c0a19c97e2d528110c4fa3
branch: integration/vis2-dr-rc1
scope:
  - office3d/dr-vis2-dock-sample.js
  - office3d/dr-vis2-dock-sample-preview.html
  - office3d/tests/dr-vis2-dock-sample.test.mjs
  - office3d/office-plaza-props.js
  - office3d/tests/office-plaza-props.test.mjs
  - dispatch/trae/outbox/W-V1-R2-report.md
budget: 3h
---
# W-V1-R2：装卸月台样板视觉修正 + 共享伞盖朝向

在 `integration/vis2-dr-rc1` 上从 `b0d4c74` **继续追加提交**，不改写已审提交、不 force push。本卡与 `W-RC-R1`（货架接线）在同一分支，**两张卡串行做，先做哪张都可以，但不要交叉编辑同一文件**。

## Q-V1 复审结论（b0d4c74）

- **代码检查：通过。** 上轮两条 P1 已修：实例容量越界（`add()` 超容量抛错、`finish()` 检查有限包围盒）、托盘纸箱埋进平台（变异可被测试抓住）。挡风玻璃、护栏位置、阴影、高度参数均已修正。请保留。
- **视觉样板：未通过。** 月台墙、01/02 两樘卷帘门、车门对位、叉车已加，画面能读出"月台"，但：

## 要做

1. **车轮轴向（P2，视觉阻断）**：车轮圆柱用 `Euler(π/2, 0, 0)` 绕 X 轴旋转，轴线落在 Z（车长方向），侧面看是 0.68 m 的方块，正面看才是圆。改为绕 Z 轴转 90°，轴线沿 X（车宽方向）；轮宽约 0.3 m（不是 0.68 m）。测试断言每个车轮包围盒的 x 尺寸（轮宽）< y 尺寸（直径）。
2. **门编号（P2）**：编号牌现在只是暖色矩形，没有"01 / 02"字样，且离门楣墙面悬空 7 cm（牌 z −15.85…−15.80，墙面 −15.73）。做出可读数字（画布贴图或简单几何），贴墙放置；测试断言编号牌背面与墙面间距 ≤ 5 mm。
3. **叉车（P2）**：车身 y 0.135–0.785 悬空 13.5 cm、没有车轮；货叉穿进车身 0.18 m；护顶横杆悬在门架旁。补轮子并让车身落地、货叉移到车身前方；或者去掉叉车（任务卡里是可选项），二选一，在报告写明。
4. **调节板（P3）**：现在放在平台后沿贴卷帘门处（z −16.23…−15.43），比平台顶高 4 cm 悬空并穿过门板与墙。移到平台前沿（z ≈ −18.0，车尾靠接处），落在平台顶面。
5. **绘制调用（P3）**：现 11 次，目标 ≤ 10（门编号与暖灯可并批）；测试上限从 12 收回到 10。
6. **共享伞盖朝向（范围外发现，本卡一并处理）**：`office3d/office-plaza-props.js` 第 176 行伞盖锥面以 `pitch = π` 放置，开口朝上。修正为开口朝下，并在 `office-plaza-props.test.mjs` 断言伞盖最低点在伞面边缘、最高点在中心。**注意**：办公室线（Codex，`vis2/o-office-sample` 的 `office-vis2/plaza.js`）在私有副本里自己翻正过一次；本修正合入后，集成时须去掉那次私有翻转，否则会翻回去。请在报告"集成注意"一节写明。
7. **补上 W-V1-R1 卡未交的部分**：预览页固定机位按钮（全景、月台近景、车辆侧面），顶栏保留"候选静态预览，非部署"；报告；成对截图与性能。

## 不做

不改货架单元 `dr-vis2-rack-cell.js` 及 `dr-campus-*` 接线（属于 `W-RC-R1`）；不接主场景；不改办公室私有模块、二维中控台、共享布局与注册；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 报告 `dispatch/trae/outbox/W-V1-R2-report.md`（放工作分支）：做到 / 没做到 / 未验证；改动文件与行数；叉车取舍；集成注意（伞盖私有翻转）。
- 截图（本次 SHA 新采集，标注浏览器、GPU、分辨率、画质）：全景、月台近景、车辆侧面三个固定机位，与 `b0d4c74` 同机位成对；与参考图"收货月台"局部并排一张。截图放证据分支或报告附件位置，不进源码历史。
- 测试：定向 `tests/dr-vis2-dock-sample.test.mjs`、`tests/office-plaza-props.test.mjs` 与全量（`node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/*.test.mjs`）真实输出末尾；失败按名称与 `b0d4c74` 比较，不得新增。
- 完成后停下，等待 Q-V1 独立复审。
