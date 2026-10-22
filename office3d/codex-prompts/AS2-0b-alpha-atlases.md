# AS2-0b-alpha-atlases：并入 GPT 第二轮的两张真透明叶片图集（小卡，约 30–45 分钟）

**执行者：Codex（会话二）。** **前置：AS2-0 已验收（已通过）。** 董事会已保存 GPT 第二轮的两张图（我已审：真 Alpha 通道，叠洋红底检查边缘干净，无亮绿毛边，仅细叶尖有少量半透明软边）：
- 办公区 `asset-intake\gpt-textures\office\office-leaf-atlas-v2.png`（1774×887，`Format32bppArgb`；龟背竹 / 琴叶榕 / 发财树 / 绿萝花叶，各一片叶）；
- 仓配 `asset-intake\gpt-textures\campus\campus-palm-atlas-v2.png`（1536×768，`Format32bppArgb`；蒲葵扇形叶 / 芭蕉 / 散尾葵 / 蕨类，各一株）。
**用它们替换 AS2-0 里清单标为「待重绘」的两张黑底键控版**（`leaf-atlas.png`、`palm-atlas.png`）；旧版在清单里标 `superseded`，文件保留不删。

## 要做的事
1. 用 `tools\texture-prep.mjs` 增加「已有真 Alpha 的图集」处理分支：**不再做亮度键控**；做**缩放（长边 ≤ 1024，保持比例）+ 预乘去色溢（把半透明边缘颜色向内部均色靠拢，避免白 / 洋红晕边）+ 边缘 1 px 轻微收缩**；输出 PNG（带 Alpha）到 `assets\textures\office-v2\leaf-atlas.png` 与 `assets\textures\dr-campus\palm-atlas.png`（沿用原文件名，替换内容）；**两条产品线目录分开**。
2. 清单（`assets\third-party\MANIFEST.json`）：新增两条记录并把旧两条改为 `superseded`；每条写原图文件名与 SHA-256、处理后 SHA-256、尺寸、字节数、`alpha: true`、**Alpha 检查结果（叠不同底色：洋红、白、黑、深灰各一次的边缘评估）**、来源 =「董事会在 ChatGPT 生成，2026-10-22，提示词见 `GPT-round2-prompts.md` 的 A1 / A2（输出为真透明 PNG）」、许可 = 同 AS2-0。**不要编造未保存的提示词。**
3. 预览页 `texture-preview.html`：这两张在棋盘格与深灰两种背景上各显示一次；旧版标注「已被 v2 取代」。
4. 测试：`tests\texture-assets.test.mjs` 增补——两张图有 Alpha 通道、透明像素占比 > 30%、四角透明、边缘半透明像素中亮绿色比例低于阈值（用处理脚本输出的度量文件断言）；每条清单记录与文件哈希一致；单文件 ≤ 400 KB（超出则降到长边 768）、仓配目录合计 ≤ 3 MB；全量 `node --max-old-space-size=2048 --test --test-timeout=60000` 全过。
5. **不改任何场景代码**；默认页面零新增请求。备份改动的既有文件到上一级目录 `office3d-backup-as2-0b`；不读取或打印密钥，不重启服务。「做到 / 没做到 / 未验证」，**停下等我验收**。
