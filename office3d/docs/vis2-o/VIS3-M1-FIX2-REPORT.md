# VIS3-M1-FIX2 交付记录

代码提交：`b0c19b7e05dd37bdf79ca2ba42c80e9cb75244bf`，分支 `vis2/o-office-sample`；评审基线：`7de80d7166fed430bc5a2b3f7bc3346f46408eb1`。本报告所在后续提交只补交付文档。状态为待独立复核，不是自行验收通过。

## K-01：跨平台清单

`office-vis2/MANIFEST.json` 的几何源码项统一采用 **UTF-8 文本，将 CRLF 换为 LF 后计算 SHA-256**；保留 BOM、末尾换行及所有其他字符，不 trim、不格式化源码。图片项仍按原始二进制字节计算。策略已写入清单 `hashPolicy`。

源码摘要的生成与校验表达式相同：

```js
createHash('sha256')
  .update((await readFile(file, 'utf8')).replace(/\r\n/g, '\n'), 'utf8')
  .digest('hex').toUpperCase()
```

测试为每个几何文件分别构造 LF、CRLF 文本并对照记录值，另验证源码变化及额外末尾换行仍使摘要失效。直接从本代码提交读取的 8 个 Git blob 也全部匹配；没有修改榕树、地面或其他源文件来迁就清单。没有在 macOS/Linux 主机运行，本次验证的是跨换行表示的确定性。

## K-02、K-03：前台几何

从私有前台模块提取 `receptionBackdrop(front)`，让原背景和两种标识从同一个真实格栅表面计算位置；原墙面和格栅尺寸未变。

| 项目 | 修改前 | 修改后 |
|---|---|---|
| 字牌到格栅前面 | 约 31 cm | 2 mm |
| 字牌竖向范围 | `2.23…2.41 m`，高于墙顶 | `2.14…2.29 m`，低于格栅顶 `2.30 m`、墙顶 `2.35 m` |
| 背景品牌背板后面到格栅 | 约 12.4 cm | 2 mm |
| 品牌图面到背板前面 | 8.5 mm | 1 mm |

两者朝入口 `+Z`，背景品牌稍降低 5 cm，为完整字牌留出空间。几何断言用射线命中实际格栅三角形，检查贴面间距、法线、水平与竖向包含关系、字牌与品牌板之间的净距；没有用移动相机掩盖偏差。原弧面吧台标识的净距和金属收边断言继续通过。

## K-04：证据保存

已有 16 张入库截图全部保留，未删除、重写历史或声称历史体积缩小。**本次新增图片均在源码历史之外**：

- 文件夹：`E:\VirtualAIOffice\review-artifacts\VIS3-M1-FIX2\`
- 完整压缩包：`E:\VirtualAIOffice\review-artifacts\VIS3-M1-FIX2.zip`
- 压缩包 SHA-256：`BE1B19226CD2F3284256B6655B3442FDD4DC435B85D0EE62DFC42EA8DA5BB2E5`
- [证据索引](VIS3-M1-FIX2-evidence.json)：含源 SHA、截图文件名、原始文件摘要、浏览器／GPU、分辨率、DPR、画质、照明和相机参数。

文件夹和压缩包是持久的本机路径，同机独立评审可直接访问；远程评审必须先取得压缩包，不能只凭这个本机路径判断图像。本次没有上传新图片到 Git，也没有改变旧证据访问方式。

真实浏览器前后同机位截图为 `before/after-front.png`、`before/after-side.png`、`before/after-oblique.png`；还交付 `after-eye.png`、`after-overview.png`、`after-barBrand.png`、`after-bar.png`。已实际查看前台正面、侧面、斜视；字牌未超出背景、品牌背板没有悬空缝隙，前台及吧台图面仍可见。

环境：Windows 10、Chromium 155、RTX 5070 Ti（ANGLE D3D11）、1920×1080、DPR 1、medium。使用现有同源地址的静态路由读取本 worktree，无重启或部署。浏览器无 pageerror；同姿态前后台读数均为整页 `14 calls / 28046 三角形`，私有样板仍为 `11 calls / 22892 三角形`。没有增加纹理或动画资源。

## 回归

命令均带 `--max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=1`，路径明确指定：

- 定向 `tests/office-vis2.test.mjs tests/office-heart-banyan.test.mjs`：**18/18 通过**。
- 全量 `tests/*.test.mjs`：基线 **1179 项／1161 通过／17 失败／1 跳过**；候选 **1181 项／1163 通过／17 失败／1 跳过**。
- 从两次完整日志的失败摘要提取位置和名称逐项比较：**新增 0，消失 0，17 项集合完全相同**。明细见 [回归比较](VIS3-M1-FIX2-regression.json)，原始日志在外部证据包中。
- 三个改动浏览器模块通过 `node --input-type=module --check < 文件.js`；`git diff --check` 通过。

保留 25 个真实工位及其业务映射的原有断言，未修改 Agent、共享家具、房间布局、导航、热点、仓配或业务流程。O-06 会议家具修正仍归 Trae，沿用 [FIX1 交接](VIS3-M1-FIX1-HANDOFF.md)。主场景集成与最终视觉放行仍待独立评审；不推进 M2，不合并 main。

修改文件：`office-vis2/{foyer.js,frontage.js,brand.js,MANIFEST.json}`、`tests/office-vis2.test.mjs`，以及本报告和两份小型 JSON 索引。新增资源仅为报告／证据文件，无新生产资产或依赖。
