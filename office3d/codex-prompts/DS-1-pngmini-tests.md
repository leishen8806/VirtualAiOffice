---
id: DS-1
base: office3d/rev-20261022
branch: ds/DS-1-pngmini-tests
scope:
  - office3d/tests/pngmini.test.mjs
budget: 1.5h
---
# DS-1：为 `office3d/pngmini.mjs` 补单元测试（只加测试，不改被测代码）

`pngmini.mjs` 导出 `decodePng(buf)`：极简 PNG 解码（8 位、非隔行；颜色类型 0 / 2 / 3 / 4 / 6），目前没有任何测试。

## 要做的事
1. 新建 `office3d/tests/pngmini.test.mjs`（`node:test` + `node:assert/strict`，风格参考同目录其它 `*.test.mjs`）。
2. 测试里**自己用 `node:zlib` 生成 PNG 字节**（写一个小的编码辅助函数：签名 + IHDR + 可选 PLTE / tRNS + IDAT + IEND；CRC 可以填 0，解码器不校验），不读取任何外部图片文件，不联网。
3. 覆盖：
   - 颜色类型 6（RGBA）、2（RGB，alpha 恒为 255）、0（灰度）、4（灰度 + alpha）、3（调色板，有 / 无 `tRNS`，`tRNS` 比调色板短时其余索引 alpha 为 255）；
   - 五种行滤波 0–4（None / Sub / Up / Average / Paeth），每种至少一张 ≥ 3×3 的图，逐像素断言与原始像素一致（滤波编码在测试里实现）；
   - `w`、`h` 与 `pixel(x, y)` 的返回值（长度 4 的数组）；
   - 多个 IDAT 分块拼接；
   - 非法输入：截断的 / 空的 Buffer、不是 PNG 的 Buffer——**记录当前实际行为**（抛出什么错、或返回什么），用断言固定下来；不要为了让它「好看」而去改被测代码。
4. 只改 `scope` 里列出的文件；**不要改 `pngmini.mjs`、`server.mjs` 或其它任何文件**。
5. 发现的被测代码问题（例如位深 < 8 时的行为）**只写进报告的「范围外发现」，不修复**。

## 验收标准（在干净的仓库副本里运行）
```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/pngmini.test.mjs
```
- 全部通过；至少 15 个断言点；测试不依赖网络、不依赖本机其它服务、不写入仓库外的文件。
- 变异自检：临时把 `pngmini.mjs` 里 Paeth 的 `pa <= pb && pa <= pc` 改成 `pa < pb && pa < pc`（或改动滤波 3 的 `>> 1`），对应测试必须变红；然后**还原**，`git diff` 里 `pngmini.mjs` 无改动。报告里贴这次变红的输出末尾。

## 不做的事
不安装依赖、不联网、不下载素材；不碰 `app.js / ui.js / index.html / server.mjs`；不推 `main`、不 force；不在报告里写任何密钥、IP、本机路径或账号。

## 交付
- 分支 `ds/DS-1-pngmini-tests`，开 Draft PR，目标分支 `office3d/rev-20261022`。
- 在同一分支新增 `dispatch/deepseek/outbox/DS-1-report.md`，格式：做到 / 没做到 / 未验证；改动文件与行数；测试命令与真实输出末尾；变异自检输出；范围外发现。
- 完成后把 Draft 改为 Ready，停下，等待规划者验收。
