# DS-1 汇报：`office3d/pngmini.mjs` 单元测试

- 状态：**待验收**
- 分支：`ds/DS-1-pngmini-tests`
- 基线：`office3d/rev-20261022` @ `eab61eb0b8aa6ff80084ac637489d6dd0d9f569b`
- Draft PR：**未创建**（本机没有 `gh` CLI，也没有 GitHub token；分支已推送，可用文末 compare 链接开 Draft PR）
- 卡片：`dispatch/deepseek/inbox/DS-1-pngmini-tests.md`

## 做到

1. 新增 `office3d/tests/pngmini.test.mjs`（264 行，11 个 test，20 处 `assert`/`assertPixels` 调用点，执行时逐像素断言 >300 个点）。
2. 测试自己用 `node:zlib` 生成 PNG 字节（签名 + IHDR + 可选 PLTE/tRNS + IDAT + IEND，CRC 填 0），不读取任何外部图片、不联网。
3. 覆盖卡片要求：
   - 颜色类型 6（RGBA）、2（RGB，alpha 恒为 255）、0（灰度）、4（灰度 + alpha）、3（调色板，有 tRNS / 无 tRNS / tRNS 短于调色板时其余索引 alpha 回落 255）；
   - 五种行滤波 0–4：每张 4×4 图逐像素断言与原始值一致，并校验文件里首行滤波字节和扫描线长度；
   - `w`、`h`、`pixel(x,y)` 返回长度 4 的数组；
   - 多个 IDAT 分块（单块 vs 三块）拼接后逐像素一致；
   - 非法输入：空 Buffer、仅签名、100 字节文本 → `Z_BUF_ERROR`；9 字节非 PNG、截断 IHDR → `ERR_OUT_OF_RANGE`（均按当前实际行为固定）。
4. **未改被测代码**：`git diff` 中 `pngmini.mjs` 为空。

## 验证证据

验收命令（与卡片一致）：

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/pngmini.test.mjs
```

真实输出末尾：

```
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 42.245833
```

变异自检（临时把 Paeth 的 `pa <= pb && pa <= pc` 改成 `pa < pb && pa < pc`）：

```
mutation exit=1
# tests 11
# pass 10
# fail 1
not ok 9 - Paeth 平局定点：a=0,b=3,c=2 时原实现选 a、变异实现选 c
```

还原后 `git status --porcelain pngmini.mjs` 与 `git diff --stat pngmini.mjs` 均为空；再跑验收命令恢复 11/11 通过。

## 没做到

- **Draft PR 未创建 / 未转 Ready**：本机无 `gh`、无 GitHub token，只有 SSH 推送权限；已推送分支，请用下面链接在网页上开 Draft PR（base 选 `office3d/rev-20261022`）：
  `https://github.com/leishen8806/VirtualAiOffice/compare/office3d/rev-20261022...ds/DS-1-pngmini-tests?expand=1`
- 未合并、未推 `main`、未 force。

## 未验证

- 董事会本机独立验收（按协议，自报不算）。
- 本机全量 office3d 测试未作为本卡依据：该快照缺少 `office3d-backup-*` 与 Windows 绝对路径材料，全量存在**改动前就有的**既有失败；本卡只按要求跑单文件验收命令。
- 真实 PNG 素材兼容性未验证（测试全部为自造字节）；`atlas`/雷达瓦片实际文件未参与。
- 位深 <8、位深 16、隔行（interlace=1）、缺 PLTE、灰色/调色板以外扩展 chunk 的行为未覆盖（按卡片只报告、不修复）。

## 范围外发现（只报告，未修复）

1. 解码器不校验 PNG 签名与 CRC，直接从 offset 8 开始解析；非 PNG 数据靠 zlib 报错，前面可能先命中 `readUInt32BE` 越界。
2. 位深 `bd < 8` 时 `stride` 按位计算，但 `pixel()` 仍按 8 位通道索引，像素会错位；`bd = 16` 时只取每通道低字节，高位被丢弃。
3. 调色板模式缺 `PLTE` 时 `pixel()` 会因 `plte` 为 null 抛 `TypeError`。
4. `pixel(x, y)` 不做越界检查，越界会读到 `undefined` 并写入返回数组。
5. 不校验 IHDR 的 `interlace`：隔行 PNG 会被当作非隔行解码，得到错误图像。
6. `tRNS` 长于调色板时，多出的 alpha 会被忽略（当前实现只按下标取）；本卡只固定了「短于调色板回落 255」的行为。

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/tests/pngmini.test.mjs` | 新增，264 行 |
| `dispatch/deepseek/outbox/DS-1-report.md` | 新增（本报告） |

`office3d/pngmini.mjs`、`server.mjs`、`app.js`、`ui.js`、`index.html` 均未改动。
