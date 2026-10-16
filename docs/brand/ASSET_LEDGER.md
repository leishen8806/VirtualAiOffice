# 第三方资产登记表

只允许明确标注授权的资产：第三方代码必须使用 OSI 许可；美术素材必须明确标注 CC0。

下载任何外部文件之前必须先获得苏晨或大旺的人类审批。

校验和由 `test/vendor-assets.test.js` 自动核对；手工改表会被测试打回。

| 文件 | 用途 | 来源 URL | 作者 / 项目 | 授权 | 获取日期 | 字节数 | SHA-256 |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| public/vendor/three/three.module.js | Three.js ESM 公开入口 | https://registry.npmjs.org/three/-/three-0.185.1.tgz (`package/build/three.module.js`) | three.js contributors / mrdoob | MIT | 2026-10-16 | 650153 | bbf5ed13fe4373f5bd38b14ea8e62e9f157327da5638edc6d3863e08b167c9c7 |
| public/vendor/three/three.core.js | Three.js ESM 同目录运行时依赖 | https://registry.npmjs.org/three/-/three-0.185.1.tgz (`package/build/three.core.js`) | three.js contributors / mrdoob | MIT | 2026-10-16 | 1443056 | 3718df126d69c125362a03340913204470d8c50238605150e57f808840fb7759 |
| public/vendor/three/LICENSE | Three.js 上游授权文本 | https://registry.npmjs.org/three/-/three-0.185.1.tgz (`package/LICENSE`) | three.js contributors / mrdoob | MIT | 2026-10-16 | 1081 | 8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc |
