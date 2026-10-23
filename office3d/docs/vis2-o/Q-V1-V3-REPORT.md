# Q-V1 V-3：接待台曲面受光修正

日期：2026-10-23。分支：`vis2/o-office-sample`。
修改前基线：`00b6a9e6b0fb8809c2c8ed02c2d532eeed032196`，开工工作树干净，已 fetch。该基线不是主场景部署版本。
备份：`E:\VirtualAIOffice\office3d-backup-q-v1-v3\`。

## 做到

- 真实浏览器斜侧近景复现接待台竖向明暗条带；源码使用 ExtrudeGeometry 默认逐面法线。
- 仅在私有 `office-vis2/foyer.js` 中将四段接待台曲面法线按原二次曲线切线平滑；台面、底面与直背面保持硬边，未增加分段。
- 平滑放在批处理生成贴图坐标之后。早期方案改变少量 UV，已撤换；最终与备份逐数组比对，位置、颜色、材质参数与 UV 完全一致，仅目标法线改变。占地和摘要逐数据一致。
- 接待品牌牌、背景 Logo、吧台、树冠、工位和共享文件均未调整；没有新增资源、灯光或动画循环。
- 新增曲面法线与端盖硬边回归检查，旧代码失败、最终代码通过；同步 canonical LF 源码哈希。

## 真实浏览器证据

Windows / Chromium 155，1920×1080，DPR 1，medium，FOV 42°。Playwright 映射候选白名单静态文件，没有启动服务或替换业务接口。
修改前图片来自本轮实际 B0，修改后图片来自最终工作文件；`interim-*` 为已放弃的中间版本，不能用于最终验收。

| 机位 | 相机 → 目标 | calls 前→后 | 三角形前→后 | geometry / texture 前→后 |
|---|---|---|---|---|
| 接待正面 | [2,2.1,13.5] → [2,1.35,8.1] | 14→14 | 30950→30950 | 13/8→13/8 |
| 接待斜侧 | [8,2.2,12] → [2,1,8.7] | 13→13 | 24950→24950 | 13/8→13/8 |

两机位页面错误均 0；照片可见台身受光连续，接待台及背景品牌仍可见。侧面与正面的不同计数来自机位裁剪，不应当作性能变化。前厅模块本身保持 2 calls / 3056 triangles。
外部证据：`E:\VirtualAIOffice\review-artifacts\Q-V1-V3\`，包含四张最终对照图、浏览器及几何比对 JSON、测试日志与证据清单。截图不加入 Git。

## 测试

资源限制：所有测试带 `--max-old-space-size=2048 --test-timeout=60000 --test-concurrency=1`。

- `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/office-vis2.test.mjs tests/office-heart-banyan.test.mjs`：25/25 通过。
- `node --input-type=module --check < office-vis2/foyer.js`：通过。
- `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1 tests/*.test.mjs`：1188 项，1170 通过、17 失败、1 跳过，168238 ms。基线为 1187 项、1169 通过、17 失败、1 跳过；失败名称与位置集合相同。**全量未全绿**，未放宽旧断言。中间版本日志 `tests-interim.txt` 不作为最终结果。

## 没做到 / 未验证

- V-1 石材色温、V-2 总览树冠轮廓仍等待董事会目视意见，本轮不改。
- 未验证共享主场景集成、多人物运行和长期帧时间；未新增录屏。全办公室按概念图对齐仍未完成。
- 未改共享布局、导航、业务、仓配或全局渲染，未部署、合并 main 或启停服务。
