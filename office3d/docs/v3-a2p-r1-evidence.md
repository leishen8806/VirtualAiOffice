# V3-A2P-R1 证据复核入口

完整回执：V3-A2P-R1 交付回执（保存在本机，不在仓库）。

外置工件：`review-artifacts/V3-A2P-R1/`，不加入 Git 图片历史。`evidence-manifest.json` 在提交/推送后绑定完整 sourceSHA、远端 SHA、文件哈希和环境；`evidence.html` 并排展示原始截图。

- `preview-browser.json`：夹具高/低档、5.8/5.45 沙发、相机和异常/请求。
- `default-browser.json`、`image-comparison.json`：旧 V3 独立预览四对全图零像素差。
- `leaf-projections-final.json`、`leaf-measurements.json`：真实叶片投影与同方法取色；原图、框图和掩模配套保存。
- `performance-final.json`：同相机仅切换陈设可见性的增量、八次生命周期和帧间隔。
- `baseline-office-tests.log`、`office-tests.log`、`focused-final-tests.log`、`test-comparison.json`：当前轮基线与候选，4 个既有失败不计为通过。
- `capture-extended-baseline.mjs`：直接读取 345cd39 的原始 Git 文件对象，构建并记录几何/材质；没有用新实现重写旧期望。
- `browser-setup.js`、`preview-capture.js`、`default-capture.js`、`leaf-capture.js`、`performance-capture.js`、`measure-leaves.py`、`compare-evidence.py`：可复查取证方法。

注意：C 仍未通过，实际边缘净距为 .375m < .45m。预览两个沙发样例都显示 `STOOL_COUNTER_CLEARANCE`；合成边界单测的通过不等于布局通过。
