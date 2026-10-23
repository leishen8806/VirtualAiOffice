# R3-R2 会话二：静态榕树资产交接（2026-10-23）

## 做到

先读取公共规则、R3-R、R3-R2 和补充文本，再记录运行基线。此次只新增独立榕树资产、预览、测试与文档；没有修改主场景接线，也没有扩散其他区域。基线见 `office-rev3-baseline.md`。

入口：`/office-heart-banyan-preview.html`。文件：`office-heart-banyan.js`、`office-heart-banyan-preview.js`、`office-heart-banyan-preview.html`、`tests/office-heart-banyan.test.mjs`。

固定种子 7319；树干、4 个主枝、细枝、暖米色树池和真正有深度的叶簇。小叶由程序几何与解析椭圆裁边组成，未使用新闻照片或既有大叶图集。主观赏面固定朝 +z，无动画、定时器或业务请求。前厅正面与斜俯预览可辨双峰凹口，最终自然程度仍待董事会目视。

| 资产档位 | calls | 三角形 | 叶簇 | 实测包围盒宽×高×深 |
|---|---:|---:|---:|---|
| 高 | 3 | 7468 | 760 | 3.97×3.75×2.79 m |
| 低 | 3 | 4428 | 380 | 3.75×3.73×2.73 m |

预览包含地面时实测 4 calls / 7470 三角形；移除地面即资产口径。10 轮高低档重建前后均为 4 geometries / 1 texture（渲染器内部资源计数），未发现递增。这个短时验证不等于无限期泄漏证明。资源记录只包含预览脚本、资产模块与本地 Three 两个文件；控制台 error 为 0。

接线接口（由会话一执行）：

```js
buildHeartBanyan({ THREE, root, center: layout.island.center, low })
```

传入宿主已有 THREE 和注册根；返回 `{root, summary, dispose}`。根相对地面 y=0，树池外沿约 0.4 m；不要将整棵树加到现有约 0.9 m 的实心吧台盘上。先移除旧树与旧树池，再安装新树。叶簇是 InstancedMesh，带独立的椭圆裁边材质，不能用全场通用材质覆盖或丢弃 onBeforeCompile。没有注册碰撞；会话一复用/检查中心种植区已有碰撞，不能重复注册。

截图在 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-r3-r2`：

- `main-before-1280.png` / `main-before-1920.png`：当前主场景改前基线。
- `banyan-concept-1280.png` / `banyan-concept-1920.png`：独立资产斜俯视。
- `banyan-foyer-1280.png` / `banyan-foyer-1920.png`：独立资产前厅方向人眼高度。
- `banyan-side-1280.png` / `banyan-side-1920.png`：独立资产斜侧视角。

以上是浏览器截图；独立资产截图不是主场景样板区改后对照。

## 测试

浏览器模块均用 `node --input-type=module --check` 从标准输入检查通过。

```text
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/office-heart-banyan.test.mjs
tests 3 / pass 3 / fail 0

node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/*.test.mjs
tests 1189 / pass 1188 / fail 1 / duration_ms 99732.0056
```

全量日志：`office3d-backup-r3-r2/full-tests-final.txt`。失败为 `tests/dr-control-room.test.mjs:23`，源码字符串 `/demoSnapshotAt/` 断言；本轮没有修改仓配文件或放宽断言。前一次运行 1177 项有两项失败，另一个 Path2D 失败在后续共享目录变化中消失；不能把两次结果混成一个固定版本通过记录。最终叶片裁边修改后，榕树专项 3 项与真实浏览器重新通过；全量非绿色，按任务卡不能宣称整卡完成。

## 没做到 / 未验证

- 会话一的主场景替换、样板区完整茶水吧/前厅调整未由本会话执行；未改 app.js/ui.js/index.html/office-v3-modules.js/office-island.js。
- 整场累计 +12 calls / 90k、主场景改前改后同机位对比、吧台/席位遮挡、人物点击和 20–30 秒进入退出录屏未验证。资产 3 calls 不能直接当主场景后处理后的增量。
- 央广图文链接可读；本次未取得可逐像素对照的本地实景照片，不能宣称测绘复刻或参考照片相似度已通过。
- 未重启服务、未下载素材、未改业务、未新增动画；静态造型通过后再讨论叶簇轻摆。

当前状态：独立资产待目视与接线验收；全量测试仍有仓配失败，不能放行整卡。
