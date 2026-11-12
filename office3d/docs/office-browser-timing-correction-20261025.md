# 浏览器帧时间取证口径更正

本次核对 O0—O4 原始取证脚本时，确认旧 `metadata.frames` 的45个间隔来自 `requestAnimationFrame` 回调。该回调可以发生在宿主因限帧而没有绘制的时刻。因此它是浏览器回调节奏，不能直接称为三维场景实际绘制帧时间或 FPS。低档限30FPS时，这项旧观察仍约17.6ms，就是可复现反例。

受此限制的已知记录包括 `architecture-ibl-final/`、`forecourt-paving-final/`、`plaza-broadleaf-dense-final/` 中 `capture.js` 产生的 `metadata.frames.medianMs/p95Ms`，以及引用这些字段的对应报告。更早复制了相同采样代码的记录也应按其原始脚本逐项核查，不能直接作为绘制FPS证据。保留原日志和旧结论，增加本更正，不删除证据或重写提交历史。

这些记录的 calls/三角形集合来自包装后的真实渲染结果，几何、文件哈希、实际截图、请求及资源记录并不因此整体失效；但不能再用回调间隔为实际绘制性能背书。旧元数据首次读取曾主动调用一次 `env3d.render()`，新固定分辨率取证已删除这次调用，只读取既有宿主循环结果。分类 pass/阴影探针应仍按其单独标注的测试范围理解，不能混成用户正常帧时。

## 新测量

`E:/VirtualAIOffice/review-artifacts/OFFICE-O0-O4-20261024/plaza-broadleaf-fixed-final/actual-performance.json` 与同目录 `capture-actual-performance.js`：

1. 在现有 `env3d.render()` 的既有调用点记录121次开始时刻，得到120个真实绘制间隔；没有新建三维循环或主动绘制。
2. 单独记录此调用的CPU提交耗时；它不等于完整更新/绘制CPU时间，也不等于GPU计时。宿主 `quality.metrics` 另行保存用于核对。
3. 使用现有 `fixeddpr=1` 诊断参数，前后均1920×1080、DPR1、同机位、同画质、聚焦页面；每一轮断言页面可见且实际DPR严格为1。没有修改 app/env/quality 或生产配置。
4. 首轮真实绘制探针仍在旧版出现DPR0.99144、新版DPR1，故保留于 `plaza-broadleaf-dense-final/actual-performance.json`，但不把它计作同分辨率比较。新证据目录与旧记录分开。

这次实测高档约55.07→56.31个绘制/秒，低档约30.00→29.99个绘制/秒。120间隔是短观察，不能证明长期稳定、4K/60fps、低端设备达标或此次美术改动造成提速。具体CPU、尾帧、首帧和原始时间序列全部保留，不能只挑平均值。

这是一项作者取证方法修正，不是产品画质逻辑修复，不新增业务请求或绕过验收。
