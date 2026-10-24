# W-V1-R2 月台视觉修正与共享伞盖朝向报告

基线：`integration/vis2-dr-rc1 @ ba1e9e21e2af70fb57eba0b710c9cbfe3b796b77`

## 做到

1. 车辆四个车轮改为绕 Z 轴旋转，轴线沿车宽方向；轮宽为 `0.30m`，小于直径。
2. 两个卷帘门增加贴墙的七段几何门号 `01`、`02`；编号与墙前表面的间距不超过 `5mm`。
3. 保留叉车并完成落地：车身中心降至 `0.325m`，补四个 `0.30m` 宽车轮，货叉位于车身前方，护顶横杆回到门架上方。
4. 调节板从后墙/门洞移动至月台前沿。
5. 将门号并入现有黄色标线 batch，模块由 11 个绘制调用降至 10 个。
6. `office-plaza-props.js` 的咖啡桌伞盖取消 `pitch = π`，锥面尖点位于中心上方、开口朝下；新增几何回归。

## 测试

```text
node --max-old-space-size=2048 --test --test-timeout=60000 \
  office3d/tests/dr-vis2-dock-sample.test.mjs \
  office3d/tests/office-plaza-props.test.mjs
```

结果：11/11 通过。

```text
node --max-old-space-size=2048 --test --test-timeout=60000 \
  --test-concurrency=1 tests/*.test.mjs
```

结果：1046 项，1028 通过，17 失败，1 跳过。失败项均为隔离 worktree 缺少历史备份或本地 JSON 的既有环境依赖；未包含本卡两组专项测试。

## 静态预览证据

- 严格 Playwright 路由从候选 worktree 返回 10 个明确映射文件；未映射请求 0，控制台错误 0。
- 四个固定机位均标注“候选静态预览，非部署”。
- 月台模块：`10 calls / 1,044 triangles / 0 业务请求 / 0 动画循环`。
- 预览场景全景/货架中景/近景的改后读数为 `21 calls / 26,426 triangles / 约 16.66ms`；车辆侧面为 `17 calls / 12,230 triangles / 约 16.66ms`。

本次“改前”画面是同一候选静态场景隐藏月台模块的可见性对照，并非检出历史 `b0d4c74` 的源码重放；因此不将它表述为历史版本的性能基线。

## 集成注意

Codex 的 `office-vis2/plaza.js` 私有副本曾自行翻转伞盖。共享 `office-plaza-props.js` 合入后，最终集成须移除该私有翻转，避免将伞盖再次翻回开口朝上。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `office3d/dr-vis2-dock-sample.js` | +23 / -15 |
| `office3d/dr-vis2-dock-sample-preview.html` | 未改；保留静态预览标识 |
| `office3d/tests/dr-vis2-dock-sample.test.mjs` | +14 / -1 |
| `office3d/office-plaza-props.js` | +1 / -1 |
| `office3d/tests/office-plaza-props.test.mjs` | +14 / -0 |

## 没做到

- 未接入主场景、未启动或重启服务、未部署。
- 未修改货架单元或共享注册链。

## 未验证

- 真实仓配主场景中与 `b0d4c74` 的历史同机位 WebGL 性能成对测量。
- Codex 私有伞盖翻转的最终集成清理。
