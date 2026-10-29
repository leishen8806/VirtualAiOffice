# 素材登记表（办公室 3D）

所有第三方素材都先下载到隔离区 `paperclip-ops/_quarantine/`，核对哈希并经批准后才拷入本目录。

## 来源压缩包（隔离区原件）

| 包 | 来源 | 大小（字节） | SHA-256 | 许可 |
|---|---|---|---|---|
| kenney_furniture-kit.zip | https://kenney.nl/assets/furniture-kit | 5130729 | e67652d0932cee41683f74711c03d3e192a2af9979ef8e6b237711f5482d46b0 | CC0 1.0 |
| ubc-standard.zip（Universal Base Characters[Standard].zip） | https://quaternius.itch.io/universal-base-characters | 128968391 | fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40 | CC0 1.0 |
| ual-standard.zip（Universal Animation Library[Standard].zip） | https://quaternius.itch.io/universal-animation-library | 15904933 | cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724 | CC0 1.0 |
| three-0.185.1.tgz | https://registry.npmjs.org/three/-/three-0.185.1.tgz（npm integrity 已核对） | 5320348 | a2143f5bf978bd3470a51024b2b6bdd581913ba8f36ff1538d433f3a95adf2df | MIT |

## 本目录里实际使用的文件

说明：角色与发型的 `.gltf` 是**改过贴图路径的副本**（原包里法线贴图文件名对不上，已改为实际存在的文件名），其余内容未改；贴图、`.bin`、`.glb` 与原包字节一致。

### Three.js r185 加载器（npm three@0.185.1，MIT）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| vendor/three/jsm/loaders/GLTFLoader.js | 114959 | 97642d720f16cc9a0c9844934198e4d0c023bea8e89576d0f7545d03b2d103d2 |
| vendor/three/jsm/utils/SkeletonUtils.js | 11535 | b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f |
| vendor/three/jsm/utils/BufferGeometryUtils.js | 37621 | 5c552223a9309883743b80538d6e9cdb45e3227f30d3ec56fb2c39b46e78d595 |

### Kenney Furniture Kit（CC0）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| assets/models/furniture/License.txt | 614 | bc0de1a0742cb490f9ed4bae0bd284286ebb27e23149b9917c7d8c0d590b8b29 |
| assets/models/furniture/bookcaseClosed.glb | 23132 | 9d210448de5e1179541da895450bbc7a39f4cd673d677654cd6b134e4ea0e047 |
| assets/models/furniture/bookcaseOpen.glb | 18020 | 750702218d68c062b15dfef6ab06a4014d1cfa8bd05f02e57c53b7e13bec157c |
| assets/models/furniture/books.glb | 6864 | b8dc56e5d29f6fc1f4727fccb1b9642627fee9942c48060a00034e98df02701c |
| assets/models/furniture/cabinetTelevision.glb | 10524 | 811719593d676ff76f7b5904d52c845ce0396af2bc9a6a2636c4818ead320b99 |
| assets/models/furniture/chairDesk.glb | 39016 | 46406619186034cbe92b19b79a5f1a8e3f442a17a70a7524ef2c0ad0f35095c6 |
| assets/models/furniture/chairModernCushion.glb | 7376 | 245132697e633e907e2b48c86d56f6c8543604a3440a055d1c71c06ce11d2858 |
| assets/models/furniture/chairRounded.glb | 17156 | 53f4933ec547179c499f04dbda1231cf44b83ec82c7f4ab981cdf680aee5c973 |
| assets/models/furniture/coatRack.glb | 9948 | 0f56540d57367ea6fea6b9aedf305d4fc58abeec8ff3b039dbff44360d819c76 |
| assets/models/furniture/computerKeyboard.glb | 3476 | 9d9135789de2120e9f41ce3f0a56dd1b15f40adcc7888739bb842a2d820da322 |
| assets/models/furniture/computerMouse.glb | 5868 | d3ad1a923f0f7707ef367bb969eb94c9076e211c98c830ba52e133fadc5cdfc0 |
| assets/models/furniture/computerScreen.glb | 6404 | 5942cbad29a2d2b956619569926e81d50a4174403d592fece6556e57632dc643 |
| assets/models/furniture/desk.glb | 15048 | 0164fe828f028b321730fb8c74502e353583f751be74da1682d42fff7d3c5a42 |
| assets/models/furniture/kitchenBlender.glb | 18728 | f471defb5b2b1cf3b949a1a8aaef0a8b727afe662b0815068cf4e963325a3c1f |
| assets/models/furniture/kitchenCoffeeMachine.glb | 13332 | 063f582c6fa0f00a9f24e3393dac2295491c4becdaf5513c893ab1a2826b6ec3 |
| assets/models/furniture/lampRoundTable.glb | 6604 | 75bb644caaa3da003b4fcad7a931722dd61cd2858aab70cf660021d5061fa1b2 |
| assets/models/furniture/lampSquareFloor.glb | 5624 | 6466993748d8e184de9ec5b6b0af613867c50c0ce320d1898b1db9e4c27c2561 |
| assets/models/furniture/laptop.glb | 5540 | 5fa8a1f4a71ab8d82ef64da77a6973ffd350c6d4557516069a4ffd4bb8d808af |
| assets/models/furniture/loungeChair.glb | 9648 | ddfe6bc4b3451bca61666d7b614552d6ed2a03d82fc76244b72ae3155874dc6c |
| assets/models/furniture/loungeSofa.glb | 9644 | 1886b811c0d3ad0d8525a4fd43adf4112c497c8e0ed906f06877ca3517f4c7dd |
| assets/models/furniture/loungeSofaLong.glb | 13112 | 452df1c862f97781615e2c1c832913b48cf6c6f011d3260dc023ff3f117cc9d1 |
| assets/models/furniture/plantSmall1.glb | 8224 | 2b9c022feb47be857b2c4fdc29f36522766ba9b70c578c31d7c05d71b4377d15 |
| assets/models/furniture/plantSmall2.glb | 12996 | d7c8ff42c66dd4f9238a73570549813d1ca6c5f6f661d7af9cb764c4fce314b9 |
| assets/models/furniture/pottedPlant.glb | 7576 | 5b760eda2766f75fda36b2c5df652a1662f82981ef64cd8fa7fe7bcd386b3a15 |
| assets/models/furniture/rugRectangle.glb | 3188 | a989d2d59c04e3071e0c90388b113a9a8f339ce1814ef984c51cb6dcd7c8e0eb |
| assets/models/furniture/sideTable.glb | 8800 | 8227810584f7d37582e4e9ec821c56f1dc54b99c88a8dc74242ea3b7402bc472 |
| assets/models/furniture/speaker.glb | 15744 | 78230b9fb382a937cb19e4bf7556ee9402d33ac80b1baaee2d2eb89493cfa1fc |
| assets/models/furniture/table.glb | 8196 | ff1a94498d023957f4bc3ff6f55a7a82977d336dbf01a573b3364f03afe5ff61 |
| assets/models/furniture/tableCoffee.glb | 8256 | e38bea760fbd514efbb75528d09b4752c91af44677bbb97e6d4386c263525179 |
| assets/models/furniture/toaster.glb | 14924 | 38c1fb7b122be9997758c8ee855d87f28014cf282f24d66d39f4e8d8b236d2af |
| assets/models/furniture/trashcan.glb | 6452 | e0ccc1fe50cbd05386477fdff527171d1cf7c0de2ba7ff3233f8d9561feb2561 |

`kitchenBlender.glb`、`kitchenCoffeeMachine.glb`、`toaster.glb` 由 OFFICE-R1-FOOD（CMP-626，2026-10-29）从隔离区
`paperclip-ops/_quarantine/x-kenney/Models/GLTF format/` 拷入，用于中央吧台台面的搅拌机、咖啡机与面包机。
三件与隔离区原件逐字节相同（上表 SHA-256 即原件哈希），同属上面那个 `kenney_furniture-kit.zip`，
授权沿用本目录未改动的 `License.txt`（Kenney Furniture Kit 2.0，CC0 1.0），没有下载任何新素材。

### Quaternius Universal Base Characters Standard（CC0）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| assets/models/characters/License.txt | 806 | 0f4beaf0fe360a7732e58bbe3dbf60a2422367fbea60cb9ea4add968f383268e |
| assets/models/characters/Superhero_Female_FullBody.bin | 990808 | 3a8220a485b33d05d879115a50697728b45a151781106033afb8b8c243fca208 |
| assets/models/characters/Superhero_Female_FullBody.gltf | 24898 | 3aad6297a4ebaeea5e6239057576233df7bf8f8a37c2a54175244fa5507fe059 |
| assets/models/characters/Superhero_Male_FullBody.bin | 720076 | 459003f9745853ae562a85506a2b94dd56515c1f37728f9fa3d2ce1a3e4cd92f |
| assets/models/characters/Superhero_Male_FullBody.gltf | 24304 | 6c700b67ab15ba99ca994f88c6f8968cd96b4f834a02ff2e38aa20ffb7e5857b |
| assets/models/characters/hair/Hair_Beard.bin | 25276 | 781cf9b719d75a9f8d73881d2ca0713fe580d774edc96adaded392aad37a72b7 |
| assets/models/characters/hair/Hair_Beard.gltf | 1636 | 9b4370b5d89f50799ddef85a522aff28adc32e9049246b3864a92e058175dcc8 |
| assets/models/characters/hair/Hair_Buns.bin | 131768 | 4f6d4c010201278483da8d6d46ec40e3beb8d9e679ec2139bed216c561bccd38 |
| assets/models/characters/hair/Hair_Buns.gltf | 1829 | 1721c8013708324a193b21a62633c97dec3fdc1bd88c585b7868d210eca99724 |
| assets/models/characters/hair/Hair_Buzzed.bin | 19892 | 89992fc7a5319df6f2908e44a3b694329fac4b500629a573224702e5fdd16f77 |
| assets/models/characters/hair/Hair_Buzzed.gltf | 1637 | c8b25f8f08c268172ed314b2b9e92813d6e1e47d79964786bb2798c81ec1eaa2 |
| assets/models/characters/hair/Hair_BuzzedFemale.bin | 19892 | 6f1ab9bc997b01311dc0635ee165edfe27bd9715222718bc4cf4265e10b933af |
| assets/models/characters/hair/Hair_BuzzedFemale.gltf | 1780 | 3e0187d1d5d86dce7b8cf8ec77e602834d02e0760d4f215fe748bbf005a84fb5 |
| assets/models/characters/hair/Hair_Long.bin | 115996 | 13996da35c7afbf8cb5097da37207ee5b7c2e2904d4ab9e2ace9843030fff8d5 |
| assets/models/characters/hair/Hair_Long.gltf | 1684 | 8a1931f9a70a27bae1a8500f95272e1d29dc9cade074c6bf6496837ab6337e48 |
| assets/models/characters/hair/Hair_SimpleParted.bin | 32032 | 57c6359703a37e346ee38a9c7ba55c8dee761c0a02da99847d06f5a91728f3cc |
| assets/models/characters/hair/Hair_SimpleParted.gltf | 1641 | 4568e0f3daae15fd93680b746e7da7e796d4465808ea97f9c8d4c0d9d067dfc4 |
| assets/models/characters/tex/T_Eye_Brown.png | 35958 | d08e3356a83211bc6ca21fe3a8e39f4b5c1a3b8f85457fc2c0fb57be09935025 |
| assets/models/characters/tex/T_Eye_Normal.png | 15099 | 9ed61f7726a54fe346a78b9e5a18905d8e2b88f86235d97f53cd207a26f3f8c7 |
| assets/models/characters/tex/T_Hair_1_BaseColor.png | 1570376 | bc7aa863bd22ab0a995cd838cceb4d3a5186ee54ee2fb0108fad85d20c057e6e |
| assets/models/characters/tex/T_Hair_1_Normal.png | 4326126 | 57fd0ad8c96a4d01b38769637e066cecaa285b456f6e48ce00863754a457affb |
| assets/models/characters/tex/T_Hair_2_BaseColor.png | 1729467 | f9f4f2fb3eeeefb0b6f0fdef38b0770fd6607640c1c680b8139dd76697e9f9b3 |
| assets/models/characters/tex/T_Hair_2_Normal.png | 4710013 | 172f230aae0d4366c3cfc0402b2e6d1811b11f8487344bff28605eeacac1558d |
| assets/models/characters/tex/T_Superhero_Female_Dark_BaseColor.png | 1319410 | d366843ee7d9e9f37ec87a0e1c98c7f2e45573c08eeb80a51a6d9344e68cf288 |
| assets/models/characters/tex/T_Superhero_Female_Light_BaseColor.png | 1317541 | 743f811857db0b950f3ad09a0733dfa4888801ead332313ca25becea14c54f8d |
| assets/models/characters/tex/T_Superhero_Female_Normal.png | 3940537 | cf922460b43ccd31e983e34db05514c9d451dd2f9cdd01a843978e797719f859 |
| assets/models/characters/tex/T_Superhero_Female_Roughness.png | 3277022 | d2beabf2bd0313e32c68dcdbb80dca371a6e994fabf96efa97128bf9f14fa57b |
| assets/models/characters/tex/T_Superhero_Male_Dark.png | 1384380 | df680cbc1967a61e85998bfafb8f7bc0a36dd604bb3266486c4b06b1a184bb45 |
| assets/models/characters/tex/T_Superhero_Male_Ligh.png | 1389170 | 419f96dbb8811511e2d515bcdabc085ff2f219ec7b8b4e91050a84cba6888fe9 |
| assets/models/characters/tex/T_Superhero_Male_Normal.png | 4252937 | 9b25cf9200216eb754b79cf4c63b5380c419780788322f3c57cdd2b3e02679a6 |
| assets/models/characters/tex/T_Superhero_Male_Roughness.png | 3152049 | c70dabf48574cda55644d556beae1ee7cf1bdcf68a50d259d20f2f2358f27991 |

### Quaternius Universal Animation Library Standard（CC0）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| assets/models/anim/License.txt | 332 | 6d01f55c6e4c49a2c9963e147e561945ae2c83958c8ca667d90a6bffdbfac061 |
| assets/models/anim/UAL1_Standard.glb | 7618436 | 69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997 |

## 运行时的衍生处理（不是素材文件）

- 衣服（T 恤、长裤、鞋）由 `assets3d.js` 在加载时从身体网格生成，按 VI 配色着色。
- 家具在加载时按 VI 配色重新上色（`PALETTE`）。
- 角色只有 Standard 免费档的 2 个人模（男、女，超级英雄体型）+ 6 款发型；其余人靠发型、肤色贴图（深/浅）、发色、衣色区分。
## 第二批（2026-10-16，董事会批准）：Microsoft Rocketbox 写实人物（MIT）

来源：https://github.com/microsoft/Microsoft-Rocketbox （master）。批准清单见 `paperclip-ops/_quarantine/rocketbox-plan/DOWNLOAD_LIST.md`（119 个文件，876.8 MB）；下载后逐个核对 git blob SHA-1，全部通过（`manifest.json` 里另有每个原件的 SHA-256）。
贴图从 2048 TGA 转为 1024 JPG（颜色）/ PNG（透明），法线与高光贴图未下载；FBX 与动画原样拷贝（动画去掉了 `.max` 后缀）。许可证：`assets/models/people/LICENSE.md`。

| 文件 | 大小 | SHA-256 |
|---|---|---|
| assets/models/people/LICENSE.md | 1066 | 17474e386e0b9e1a700cc3d06b2b0882a2c376d9c6b49c7f8274409b8f8d2352 |
| assets/models/people/anim/f_gestic_talk_neutral_01.fbx | 4761664 | fee2c764dcfac6f2edd85e73e11b1a13aac305372cbd657207d4c947b21a2476 |
| assets/models/people/anim/f_idle_neutral_01.fbx | 2959360 | fd68b33ea9e290dc734ca8c3a71ef5842bb2dfe719853ff84f6336d06d39fdcb |
| assets/models/people/anim/f_sit_table_gestic_thoughtful.fbx | 2947024 | c86ad99ffa89d8b89e04e3b8b51363ea01f96752cff298a119c7255534ed5d22 |
| assets/models/people/anim/f_sit_table_idle_neutral_01.fbx | 4516208 | 518e3790c39fbda5de67cbbec5f72d0b1f1912e988d3a56ed1944bef6062afaa |
| assets/models/people/anim/f_walk_neutral_01.fbx | 993792 | 20238709c689d46f5864aebaa58918cc1233cb9045b24aa4d58cf2752786a73b |
| assets/models/people/anim/m_gestic_talk_neutral_01.fbx | 5977648 | 4c2b9ff481a9538dafbbe7f6aa6ffd6b948b5d34bb16a1e2052e943bbbbd3cd8 |
| assets/models/people/anim/m_idle_neutral_01.fbx | 2418544 | 818cc185af21390575f7fbfdeb3012ba2ce5969fbcb220ea725a2617b339a6e2 |
| assets/models/people/anim/m_sit_table_gestic_thoughtful.fbx | 3168208 | 22e4baa64e1a09dfb3a3b4dda433300d21dad72a0e37ebe746c31fe6fe3c1242 |
| assets/models/people/anim/m_sit_table_idle_neutral_01.fbx | 7189408 | b0d32e673184f5907332ff5094518834cd838bd68591a410ce06298126a1815c |
| assets/models/people/anim/m_walk_neutral_01.fbx | 994336 | e6805ae6b6b49fe10f06c1b17b14ddde90d09b9fea689ac34793df252f44dcd0 |
| assets/models/people/Female_Adult_01/Female_Adult_01.fbx | 609152 | 8cbaf86576004b96469bc80df123b97fef788f4a7bb3f3eaa616fcfaf55698a3 |
| assets/models/people/Female_Adult_01/f001_body_color.jpg | 194323 | 1be20f40aa95a140ed532eca296e67c529027eb3f2aa32b82585e0f798bc3bf0 |
| assets/models/people/Female_Adult_01/f001_head_color.jpg | 179763 | 60c4bf8b3ba46843425c2a5e2b7407cd0dd81bead6d86876967c56a0859c76c1 |
| assets/models/people/Female_Adult_01/f001_opacity_color.png | 1001511 | 3453c4be1c2b29021602304199fa9327d18736a3da247089359a8f2dfafdfbb4 |
| assets/models/people/Female_Adult_01/preview.png | 434013 | b380856dcfa982bdb178317530d1d7b8331b26a1f01cb9aa08d0b55ac2c502ce |
| assets/models/people/Female_Adult_02/Female_Adult_02.fbx | 580800 | 71a9d3495d06e42e33f9276795bd75fea9d4779c5ad47f65490f049ae2b7eaa9 |
| assets/models/people/Female_Adult_02/f002_body_color.jpg | 212425 | 40ab82db3f16c664dd7d4188411dc2dd2b7366a6062b4092354c3b2ef0d675c6 |
| assets/models/people/Female_Adult_02/f002_head_color.jpg | 188552 | 12c8b248142e5689445d1574f3037e70c5bd83d67d423e74e2850b80d3f39760 |
| assets/models/people/Female_Adult_02/f002_opacity_color.png | 1392936 | 892139137e32a2a15c2cce4c684f9c1800e23ba0e3b3fb4aaf79cae71f200e30 |
| assets/models/people/Female_Adult_02/preview.png | 415947 | e923fb2bd8f9f59382dc40e3d3dc9e922f8785f94dececcc116a3e06b8926087 |
| assets/models/people/Female_Adult_03/Female_Adult_03.fbx | 791312 | d8930ca41e72166310622c9ffacd752d93459518ca5e59c84a32b07a10acaebd |
| assets/models/people/Female_Adult_03/f003_body_color.jpg | 162636 | 37f04c8e00de9aa670dfdf2e685bd22e2f93b8d72a0cda98471c77edb9ad11dc |
| assets/models/people/Female_Adult_03/f003_head_color.jpg | 147655 | d708e731955e699eca30170772e03ab0d5f4d31142d6b201aecd134ec203582f |
| assets/models/people/Female_Adult_03/f003_opacity_color.png | 1628209 | 7c23414b011ba0ee53ce6c68d93378d64712802ac663b07a501d09ec45d0903f |
| assets/models/people/Female_Adult_03/preview.png | 400279 | 87f8bddf274657d1ac10c9e58ce906bfbe8648fa752eca34505ecaa1d8af434f |
| assets/models/people/Female_Adult_04/Female_Adult_04.fbx | 635552 | a1a0debc6851d0ffe2079b5743d3255ad115139ccd6f8c8fccfd52c49bef6dfd |
| assets/models/people/Female_Adult_04/f004_body_color.jpg | 168839 | 45ea042585eff87669ff041ca4a1ec65dcb567f59a0d5d3d18cc4036937169a3 |
| assets/models/people/Female_Adult_04/f004_head_color.jpg | 205167 | f6572ee00279570b2d0b7288f98e5c7c6075a200609304573b3336d83c4b6cd0 |
| assets/models/people/Female_Adult_04/f004_opacity_color.png | 1025343 | b179e345136a72c7228a9275178c81e7996ed27c2a47cd7c70686e73d3b7fd44 |
| assets/models/people/Female_Adult_04/preview.png | 430066 | 70690c367c531d38cf04d98c6705d9da5e530b5b5391002e47a9ace586fc2623 |
| assets/models/people/Female_Adult_05/Female_Adult_05.fbx | 594160 | fffbb46af5f0f0323abad47f04f6067ec6f8757a345d5e53804601bbb77feca4 |
| assets/models/people/Female_Adult_05/f005_body_color.jpg | 317757 | e61e567ebe863cb969a7ef8bb53e2d96dbca24500be79134f81d2c87c9f61c42 |
| assets/models/people/Female_Adult_05/f005_head_color.jpg | 134793 | 1f7dad9d6161faadc1134bc8216f9dbb7f6db74fc35be0f891123038324d9843 |
| assets/models/people/Female_Adult_05/f005_opacity_color.png | 1471849 | 01236f9a06fb5277921788b49bce48385770f99c0657248612d56f31bf455534 |
| assets/models/people/Female_Adult_05/preview.png | 420293 | dd97b6d503a6d828d929be72e97fd02283c67e85fa74519dd5f8e8a8ca6a40e5 |
| assets/models/people/Female_Adult_06/Female_Adult_06.fbx | 529632 | ba3d6050d57d806b1461af48af446de5841a16d181d24f9c893f78949c193b20 |
| assets/models/people/Female_Adult_06/f202_body_color.jpg | 118244 | c822f4bc3a146c1eebef450e326a9c434b6941e98c3e635f744c47fd945eaa70 |
| assets/models/people/Female_Adult_06/f202_head_color.jpg | 120329 | 30b217357cb79202a9bf7d756e33908974402c8851e937504515762c3365cfe6 |
| assets/models/people/Female_Adult_06/f202_opacity_color.png | 312887 | d82754302cdcefc6342240056befed3646fe0e88d7c15739a442c028cf696d24 |
| assets/models/people/Female_Adult_06/preview.png | 466661 | f50910e2868c898e20bd5beeec878e61d1e6c842959d755b7379a5d51a436bd0 |
| assets/models/people/Female_Adult_07/Female_Adult_07.fbx | 591744 | faaa677ad270784b87538d16839c179b0930a121fa0bb3fed8f3ed189b33a98a |
| assets/models/people/Female_Adult_07/f007_body_color.jpg | 163550 | f8d614926595373d10a04ea1a36d89dc9bf332b343465a58821eeed1819611fa |
| assets/models/people/Female_Adult_07/f007_head_color.jpg | 165460 | d5ceb4b0ba4413d0042d2dc5bb30cf413604914326c5583b4d55117591ad7a27 |
| assets/models/people/Female_Adult_07/f007_opacity_color.png | 1294635 | dfafbd7454ac53afe34a6c96314f2b92cecc4a86099b955755c909e1320cac3c |
| assets/models/people/Female_Adult_07/preview.png | 421304 | 532a2cc872820a36dc242b7b1de760f4369f1ba5fd42f373bc489bb55d4b16cc |
| assets/models/people/Female_Adult_08/Female_Adult_08.fbx | 594640 | cf857fe04595edee9174caaf3f0d18dd5d5cc4d0702c8851f2cc413dd8cfea9e |
| assets/models/people/Female_Adult_08/f008_body_color.jpg | 176976 | 4f549f5520662b266b31341bd597f5f083757dbc3b94c88ce38e20717bf237c7 |
| assets/models/people/Female_Adult_08/f008_head_color.jpg | 160576 | 95b61b960a2b9fffcb2a02b7c8a4661a16702e50927bbdfaf434dc8a9b5926d8 |
| assets/models/people/Female_Adult_08/f008_opacity_color.png | 1282468 | 0223c3557eecdc35b627c3f1cd361d8ace91e5537f95b4643904468d7f962ba9 |
| assets/models/people/Female_Adult_08/preview.png | 407395 | 07d472a0676509e5c6c08913780be4bf99af9b5aad52f5de7b5ecf4e817c51cc |
| assets/models/people/Female_Adult_09/Female_Adult_09.fbx | 611632 | a578ec65cabf169d7b13c0bb0a6c472e898857e81f6207b2af7f846d8b0d8523 |
| assets/models/people/Female_Adult_09/f009_body_color.jpg | 187208 | 9a7fa6236d3900248cc9b17e1dc5c1acaf9f657ec0077f0b2b535d47143d1bf7 |
| assets/models/people/Female_Adult_09/f009_head_color.jpg | 156151 | 632b345dd2f3118abf660f86a9a731d5755f479e6aca6574ffd50387fde9ebb5 |
| assets/models/people/Female_Adult_09/f009_opacity_color.png | 1301603 | 7e6d00375d75dab3aa4037be88b4ca2d2e4b2b827787db603f8044de745183ce |
| assets/models/people/Female_Adult_09/preview.png | 430008 | 63d6b0ab317b5bce514c50279ffc8f37ca9c8e359f19e335fafa671abe6c7a01 |
| assets/models/people/Female_Adult_10/Female_Adult_10.fbx | 509024 | a8680680176f9c4cfe17fe4c8305750ec47d6237cf6692464191ef33af251db8 |
| assets/models/people/Female_Adult_10/f201_body_color.jpg | 96254 | 82c31aa483bf4a72cfcc713277b13d363b6b6e2f119d990b853e5885e645093b |
| assets/models/people/Female_Adult_10/f201_head_color.jpg | 63323 | 785685f98fa1f9563bc6f3e54045f497262e6df939c29aeb05d3782225c527aa |
| assets/models/people/Female_Adult_10/f201_opacity_color.png | 34545 | ba58f1968213905829c66bec51b9d8b5937e30f1413090a485bf283a07a8daf5 |
| assets/models/people/Female_Adult_10/preview.png | 549154 | 4eb8dd9776ff0ccc2b65a666e9ea69d8037b0f29c0161257460fa74fd6253898 |
| assets/models/people/Male_Adult_01/Male_Adult_01.fbx | 521472 | 8d1edb51b4dc3427ae2456f4407fc105532c145dd019e53cd42bab31cc948a29 |
| assets/models/people/Male_Adult_01/m002_body_color.jpg | 208172 | d8281dcad9424b4a2914f837b665c001a251925cceb0ad4c6acbc71bd0919541 |
| assets/models/people/Male_Adult_01/m002_head_color.jpg | 148913 | de94bd3f3757f7effd9bfc1672cd7779fad7e7bac347d59b6a33dd9f99e823a3 |
| assets/models/people/Male_Adult_01/m002_opacity_color.png | 1465465 | 6f4d1e945084d52fccbdb73186a028e818c9f7a519fd817313ee85ee23de6486 |
| assets/models/people/Male_Adult_01/preview.png | 450889 | 54c9b5a695881c3d8aea99fb23d234282a5642c3e96f966b441ab7893461d535 |
| assets/models/people/Male_Adult_02/Male_Adult_02.fbx | 539920 | 1c65e292e9057a23f7f70969f6971c631c1316fcaaf93e575a4557201c835018 |
| assets/models/people/Male_Adult_02/m003_body_color.jpg | 160024 | 374fb0f31c3953003d15d85db740953ae50ca3bd505b05283bf2599bc38a9deb |
| assets/models/people/Male_Adult_02/m003_head_color.jpg | 142063 | 5f8481c3dfabf937a57c9b14fc94cb659c2aa3c03c1df54e5f773fcf053d8983 |
| assets/models/people/Male_Adult_02/m003_opacity_color.png | 1032412 | b39b2e48a813450af02800e5a597296669c28116218291f91e2a5e7d87c5a9f9 |
| assets/models/people/Male_Adult_02/preview.png | 478395 | 2df56390d069f322e43eeebf2bdff6f0f911769805d29c6e9595cc19f3420f36 |
| assets/models/people/Male_Adult_03/Male_Adult_03.fbx | 513728 | 7064a9f50c95975c6d64ab0c5f5504364bad4ac987750728d0b5f1788fd59dcf |
| assets/models/people/Male_Adult_03/m004_body_color.jpg | 233808 | 9da59c6482a2642ce69ba53e0404256deefe779d4993fb7150cb22c91f8e51ab |
| assets/models/people/Male_Adult_03/m004_head_color.jpg | 180602 | 7b1346419c7c87ee9f9d29a8e7779c921c0c0826fdc3362dbbbf519f3dcd75f8 |
| assets/models/people/Male_Adult_03/m004_opacity_color.png | 914520 | 041bb694f869b013bcb6e6986e8e159c0f8626edead14ab7f55f32d6ca71e82f |
| assets/models/people/Male_Adult_03/preview.png | 515426 | 0a5cece1ce2bf7f44df7fab730d332c934a8f21ff4dda098b49e2ece6223936b |
| assets/models/people/Male_Adult_04/Male_Adult_04.fbx | 571296 | fe0d026bc59e7d7ea8f4049edf77ee8040e050224b44a10fb4727b9b3d6efba0 |
| assets/models/people/Male_Adult_04/m006_body_color.jpg | 169250 | 9f1acd52f34e71053e94df36a7d501b4ad2fe572cdd13836c51431d5d791f992 |
| assets/models/people/Male_Adult_04/m006_head_color.jpg | 156463 | cad4d44c9be226d801ac8610f448067a52f956f5ba3ae90e8cdd820cbc1d0618 |
| assets/models/people/Male_Adult_04/m006_opacity_color.png | 1302140 | 3e5ae90bc00572de9cdeb7f4f7d6453ed554c62e959d59a6f6932a8579f9a740 |
| assets/models/people/Male_Adult_04/preview.png | 511910 | df86a37938030b23701a3e00daa39c7e1b965f0a1d79c338ac8b56eb4f64efc9 |
| assets/models/people/Male_Adult_05/Male_Adult_05.fbx | 536496 | cd0e17505d7b4148cf3b19ccdec9a90f063671f841b60d193d3527a0980052d0 |
| assets/models/people/Male_Adult_05/m009_body_color.jpg | 170881 | 68256ee7b77cc19e8fffacc701afc9d749a902169c66c131276740619ed31c16 |
| assets/models/people/Male_Adult_05/m009_head_color.jpg | 176383 | fe26f3a4a6562ca349767d8c775407ac9040ed59bc2fcda9590ee893e99cddf5 |
| assets/models/people/Male_Adult_05/m009_opacity_color.png | 1498726 | 8ee4c4971be723ee032af0b749f36accf516d194d895019ef79120eea0c8779a |
| assets/models/people/Male_Adult_05/preview.png | 488838 | 48a9600b2e8651c46fe1fbb741fefdd1c4087afd10137d1704227abee37a439f |
| assets/models/people/Male_Adult_06/Male_Adult_06.fbx | 548576 | 537284add0fb8bd3bf9dd9459cba2c6d4d34de50b86dfdfef09c2c57cbf1a878 |
| assets/models/people/Male_Adult_06/m011_body_color.jpg | 178428 | dae3ae9f48ae9db6e6b665a7d05d4bca1a5ef2fa484eb873279e075b4b5b5fe1 |
| assets/models/people/Male_Adult_06/m011_head_color.jpg | 160446 | 45a5713b6b8c11d7774793782a0a7298cf46cf90ebca9771c77b786e96f2672f |
| assets/models/people/Male_Adult_06/m011_opacity_color.png | 1788683 | 5f8e6bba0685ff023b14c49f169e7b1939c0f79c60c7e217393927ed953a0c5c |
| assets/models/people/Male_Adult_06/preview.png | 485364 | b914d4979afbf2c7b5eb8ad970117bb03587f56e4116140143d6dff6d432f511 |
| assets/models/people/Male_Adult_07/Male_Adult_07.fbx | 516064 | acad3095ae886a583ec5f30878123b933f2cd5f24030c4bcddc000113a75c0cb |
| assets/models/people/Male_Adult_07/m013_body_color.jpg | 187206 | ee4a8560e143ed0e12c763a9f1932e07c9424fbc84cce86eb0207c54e5884135 |
| assets/models/people/Male_Adult_07/m013_head_color.jpg | 145989 | 796c803038e2af2aace562ad9622fa17d75ad9162ce50f20e660d47264582aea |
| assets/models/people/Male_Adult_07/m013_opacity_color.png | 685957 | 624794cb0d72a2bcd87416ac4bd830efa73fde22eccc76411876d7797a52b9d4 |
| assets/models/people/Male_Adult_07/preview.png | 482710 | f83499d67142c505bb7a93c37e1f04a77649a8eaa791321cb5f8b668df09cf39 |
| assets/models/people/Male_Adult_08/Male_Adult_08.fbx | 508784 | e0d979315a5f11050945522f9f084932807af2edeefbdb380a2c9aa36c9f9bb3 |
| assets/models/people/Male_Adult_08/m014_body_color.jpg | 133222 | 8aa77b77f5cff2fd6d0bbdea60537d709311fea961df15f856bbe5a302238488 |
| assets/models/people/Male_Adult_08/m014_head_color.jpg | 152757 | adc37440cf718b92d6f61d7fe1d9730f6dc0c6cba9f31354ad42ea8ca819769a |
| assets/models/people/Male_Adult_08/m014_opacity_color.png | 1447805 | b563844f311e3298c1dd198b08829b5bb02488ab2470d717950f6eb689d9605a |
| assets/models/people/Male_Adult_08/preview.png | 448126 | 022f5cd70091203ed8c64734ff859b0b57af62ba06cfa4ba34d31b333f715c5a |
| assets/models/people/Male_Adult_09/Male_Adult_09.fbx | 522176 | ebb89800dbad28b4352369c7149314e010806268a28d7f5bb954a4393bba3d00 |
| assets/models/people/Male_Adult_09/m017_body_color.jpg | 176067 | c170e81204f958a6a1c6c2dc7c9201b150190e4c60cfffabf13ea90871b7aea9 |
| assets/models/people/Male_Adult_09/m017_head_color.jpg | 151720 | 3118b7161bde9d9655fc7c558e4acfba0a2dd3859a1b9425811f29c7625f2a20 |
| assets/models/people/Male_Adult_09/m017_opacity_color.png | 634097 | 977cb5f8724f4a4d9764c1f10641f9e460de288a88d28a29ea6579bbdca51c35 |
| assets/models/people/Male_Adult_09/preview.png | 472224 | 67493d2ce72857cb3b93b313c7e582c4631a0b5b5222b43b8e1725e80a5a2ce6 |
| assets/models/people/Male_Adult_10/Male_Adult_10.fbx | 541104 | 6a7a693d9a7ea6c866037f0cc8e45c5243bbcff008665b2ae505f72a6648ae00 |
| assets/models/people/Male_Adult_10/m024_body_color.jpg | 146520 | a273b6f3bf0c2f21fd1a88615e76d916ad00016567b4360809a9e471322daa0a |
| assets/models/people/Male_Adult_10/m024_head_color.jpg | 130289 | 3a412a4887844e3c7976dfde6c63e414fead2e905405ea33e60b9b2f15742da4 |
| assets/models/people/Male_Adult_10/m024_opacity_color.png | 1284235 | 1fc9a8bec8e87853038c15b045f1d4b76d60b12ae914e4697865a21c067bb2b8 |
| assets/models/people/Male_Adult_10/preview.png | 457608 | 7963b9cc195cbd65b8f70d813bee5a22dc59cade1d08241a56cb6b949ea0c71f |
| assets/models/people/Male_Adult_11/Male_Adult_11.fbx | 487744 | e31f5cf98667a93861ac69da3f12aabe36b896c802a550b2799ecc18c8af0eb8 |
| assets/models/people/Male_Adult_11/m001_body_color.jpg | 175189 | e7306ed7e781a113aa83d01bc82367d83176f4855448979633f788c50b36f4b7 |
| assets/models/people/Male_Adult_11/m001_head_color.jpg | 148520 | 25a5fcd73a325638858e199c6849bcba443ce9de3d8ac06bf0adf3298bacc00d |
| assets/models/people/Male_Adult_11/preview.png | 419506 | 2aeb7c055095e6e821d234ed33f7719b5d02fdfee295e93ea72f5fa56110eac9 |
| assets/models/people/Male_Adult_12/Male_Adult_12.fbx | 487776 | b44fa6011b934abd69954fd6c5025c1e2011e05c7892acb6bbc2e9cf70a84014 |
| assets/models/people/Male_Adult_12/m007_body_color.jpg | 264110 | 845153e333b0df98e67f40db920d933c8df7800526b983f2c1f602148833b2bc |
| assets/models/people/Male_Adult_12/m007_head_color.jpg | 137149 | 8d3d12ca07cf8fcd905f4521972e9c5ca9cddd33c083841b9dffe9f8003f0202 |
| assets/models/people/Male_Adult_12/preview.png | 506050 | d680a0a9b094981f7383a47ec21cc8a5fdd8dccb5941e73e85abb3793b03a2e6 |

## 第二批：Three.js r185 附加模块（同一个已核对的 three-0.185.1.tgz，MIT）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| vendor/three/jsm/curves/NURBSCurve.js | 3888 | bef2607618a7778455e71a1f0bd206951c382d313e2e245808cc7d3533d60fb6 |
| vendor/three/jsm/curves/NURBSUtils.js | 10802 | c6bd7c4137d585098923f189687898ea3e8762ea3ecbe255d749a56353894379 |
| vendor/three/jsm/libs/fflate.module.js | 89384 | 209a4412eb48ce609edb4391992a792ffcc3983d30ee7e2b0b89a8c470f3cd8a |
| vendor/three/jsm/loaders/FBXLoader.js | 111266 | 2c0f9920e80bfb65b43fc7cd3968cc0a760cb89807b67d688c7622cea0790283 |
| vendor/three/jsm/math/SimplexNoise.js | 15148 | 4b1455617135e6b477de76244de07547d95570643379b72f4758e50161b06072 |
| vendor/three/jsm/objects/Sky.js | 9944 | 1dd7ee025607f425e15d5d9fe9850502905c837f1110c49b376a2501399dbf56 |
| vendor/three/jsm/postprocessing/EffectComposer.js | 8501 | 4e079a5886152d7e529a59aef644e968ab4d32c6a33ce016b36bf29b2eac26f7 |
| vendor/three/jsm/postprocessing/GTAOPass.js | 19890 | 855fd7953e81c1050a4abea8af4bfeb5ad9b6d879f793a9c650e3768aaec62a3 |
| vendor/three/jsm/postprocessing/MaskPass.js | 4694 | 7cd08eee9d5d6f5578beaddbdcbe9c384f6873810af27f22ab7db3ceeb127aa3 |
| vendor/three/jsm/postprocessing/OutputPass.js | 4184 | 02e4a261af34de71338185e9e87f0cbe5cba9115608d984363e1269dec1d2272 |
| vendor/three/jsm/postprocessing/Pass.js | 4218 | 444b409c235ead986893c472e720da1b779a56985c7d10b279c7944b52bd61c5 |
| vendor/three/jsm/postprocessing/RenderPass.js | 4280 | 817f6c3cdcd0fd41515d112359ea0532568eefb5aabd3b33903957ebca1b8a6a |
| vendor/three/jsm/postprocessing/SMAAPass.js | 50379 | 1a96804b8cb33ba76a67f9a8e77f2d5e2bf47b1a5c9a8476901aa75e24acb85c |
| vendor/three/jsm/postprocessing/ShaderPass.js | 3228 | e2500a5913b26bbf5148ceaae644c6edcff06a18b01494ee37bf856353d2ab9d |
| vendor/three/jsm/postprocessing/UnrealBloomPass.js | 14921 | 1158bb02f6467889aba19c1a788b9107054d7f6a558498b5e2152db5873bb859 |
| vendor/three/jsm/shaders/CopyShader.js | 729 | a33057d5ac91c43304c186ac0e8816e62bb2ed471d3a00ff3018dfd5c0389718 |
| vendor/three/jsm/shaders/GTAOShader.js | 12166 | cdea7be60452f61105375d2c18e4da2e8ce7b39a89246b1bb8fbf79319d58cfd |
| vendor/three/jsm/shaders/LuminosityHighPassShader.js | 1291 | 5044f780b6e6cf863947f64c36fe1587132f7fbe395ada863cd1e5f0388dcf1e |
| vendor/three/jsm/shaders/OutputShader.js | 1876 | 353479f77a8d7e2629d49ccac9fc2f5dbfdda5442e0adf867b00377a2fcb0cb2 |
| vendor/three/jsm/shaders/PoissonDenoiseShader.js | 7080 | 61da074a9ad8b2139dd164c96b8b62c299f056ce06c216e1f707c5151d997602 |
| vendor/three/jsm/shaders/SMAAShader.js | 15002 | 48ce320a6bf5c33806c4fa13ade7e3ab199f7856838d36b05ae82204db8a1c15 |

## 第三批（2026-10-16，董事会批准）：Rocketbox 表情模型与日常动作（MIT）

批准清单：`paperclip-ops/_quarantine/rocketbox-plan/DOWNLOAD_LIST_2.md`（45 个文件，118.8 MB），逐个核对 git blob SHA-1 全部通过。表情模型（`*_facial.fbx`）放在各人物目录；动作放在 `people/anim/`（去掉 `.max` 后缀，`f_sit_table_idle_stretch arms` 改名为下划线）。

| 原件 | 大小 | SHA-256 |
|---|---|---|
| Assets/Avatars/Adults/Male_Adult_01/Export/Male_Adult_01_facial.fbx | 1962256 | 55771cbbcffb8204dcfe450784c8439ee27bfa48efffc48d325b55ee4bd04388 |
| Assets/Avatars/Adults/Male_Adult_02/Export/Male_Adult_02_facial.fbx | 1981328 | 0f8dea5317896e16a4490ca76f7273cdaf513cc50eb855d228826ed874a15186 |
| Assets/Avatars/Adults/Male_Adult_03/Export/Male_Adult_03_facial.fbx | 1907328 | 88aedb2f47ce68dab7ddaf1f53f6357290dc4edb69fc26e3d5fa27d18ee0785a |
| Assets/Avatars/Adults/Male_Adult_04/Export/Male_Adult_04_facial.fbx | 2173840 | 04bf2ad65a5a8b8c377b29df1ae2b9c6a97d87376ed647ded0abb4e91d57665d |
| Assets/Avatars/Adults/Male_Adult_05/Export/Male_Adult_05_facial.fbx | 1978688 | 2ae6474a98d477d3c46553cb93ea3d452179afa4756db18c23e8aec97982a161 |
| Assets/Avatars/Adults/Male_Adult_06/Export/Male_Adult_06_facial.fbx | 2082768 | 9d7b04fa670de69820ca13fa09f8ed5b4ff59e741522cc1db533e24747af8d0c |
| Assets/Avatars/Adults/Male_Adult_07/Export/Male_Adult_07_facial.fbx | 1881520 | 6fbd1cd44b6145fce3caf18fdd22ccbd00fad2a019b3bf489be7e9c031269b0f |
| Assets/Avatars/Adults/Male_Adult_08/Export/Male_Adult_08_facial.fbx | 1913408 | a736f359d8adb61436de72fd59ba0acac4b42d18751b22ac4d3e2b574d7a71e0 |
| Assets/Avatars/Adults/Male_Adult_09/Export/Male_Adult_09_facial.fbx | 1930736 | 4f2c074dde9e8fe7628e497e24f97557209c1997209a5004001660dded9ed142 |
| Assets/Avatars/Adults/Male_Adult_10/Export/Male_Adult_10_facial.fbx | 1877232 | e62c3c1345150d4cfebf454fbcb906d3cc8f4c846f4ee63e06d6928438b409a3 |
| Assets/Avatars/Adults/Male_Adult_11/Export/Male_Adult_11_facial.fbx | 1779440 | 7c58b696c6f570a13dc6cb4d22f71d7ea82884eca095549fe2122c94a7f0b857 |
| Assets/Avatars/Adults/Male_Adult_12/Export/Male_Adult_12_facial.fbx | 1772832 | ef4d15accbff3e557af369bd8b6a7227ff808ab996b5c350388f081a287cbd63 |
| Assets/Avatars/Adults/Female_Adult_01/Export/Female_Adult_01_facial.fbx | 2226864 | 2e6ba71fb83a6899e3d4dd35da07fb5b078eef0c4d593f73d70cfc05dc4644cb |
| Assets/Avatars/Adults/Female_Adult_02/Export/Female_Adult_02_facial.fbx | 2050400 | befeeba2248dcb59e5a2875301b0192c8beaa1f14051a642840cfce9c9cdb053 |
| Assets/Avatars/Adults/Female_Adult_03/Export/Female_Adult_03_facial.fbx | 2397744 | 918c3de818a49b58d21e6106ffe8622c5fe84e518f2fd172a36db2fe89146901 |
| Assets/Avatars/Adults/Female_Adult_04/Export/Female_Adult_04_facial.fbx | 2349152 | ce83b428828314ef675d1a64ca17d8c3d2178cc4f8b3e80273483f83f08748fb |
| Assets/Avatars/Adults/Female_Adult_05/Export/Female_Adult_05_facial.fbx | 2158576 | 8fdc024d3a1088839712b9ea2510322d3e9b03e2f20b9f9554e4c7cb30f58d16 |
| Assets/Avatars/Adults/Female_Adult_06/Export/Female_Adult_06_facial.fbx | 1863184 | b91c6e50deea83521f71f1d75b08bd1b34ef81d9b5ca4daf71a40ed64cf2ae90 |
| Assets/Avatars/Adults/Female_Adult_07/Export/Female_Adult_07_facial.fbx | 2136864 | 88b359300657ea0efdbb34de7ab804db8b43c58b2dc143c62ed2615e75936fbc |
| Assets/Avatars/Adults/Female_Adult_08/Export/Female_Adult_08_facial.fbx | 2147392 | a98436064305b968d8bbf8a84632c746dbf5674c572f1916264f13ce53e7422d |
| Assets/Avatars/Adults/Female_Adult_09/Export/Female_Adult_09_facial.fbx | 2135024 | 4378899297e2acde9b331e6e55f83acff70ae5c26c86438231fb83770831f04a |
| Assets/Avatars/Adults/Female_Adult_10/Export/Female_Adult_10_facial.fbx | 1858560 | 7b7208b23688af2f884570a4aaa47ef803442fba2bdb2433f196bb977459e4b5 |
| Assets/Animations/all_animations_max_motextr_static/m_sit_table_idle_look_around.max.fbx | 1983056 | 57e42e4619f531b979852ae9f08470fd73c02b9fa994c0b6410ce1cb77e8cb06 |
| Assets/Animations/all_animations_max_motextr_static/m_sit_table_idle_yawn.max.fbx | 2014752 | 7c4ce491a310a5e9bf6a1bf3affb747924206be1f03c229de4b90b45685e76e5 |
| Assets/Animations/all_animations_max_motextr_static/m_sit_table_idle_scratch_head.max.fbx | 2133168 | 7525204a25d79960f45281dad1936f1592e41cc6623ee6180ed381fe69fda86f |
| Assets/Animations/all_animations_max_motextr_static/m_sit_table_idle_touch_face.max.fbx | 2232720 | b595f08d63da949b7f0d82cd2a945055744089b3023dc8533916e7566af8b5dd |
| Assets/Animations/all_animations_max_motextr_static/m_sit_table_breathe_01.max.fbx | 2531376 | 29ad66f2da4242570c45ee90e2a20c28af88233720a4531a03981a7ee9cbf96a |
| Assets/Animations/all_animations_max_motextr_static/m_sit_chair_idle_relaxed_01.max.fbx | 5949808 | f5d2ebb6c21e0067a9c9b065ff9d14f2ac3dba688b6eec9090b6e8f3af55e7d7 |
| Assets/Animations/all_animations_max_motextr_static/m_sit_chair_idle_neutral_01.max.fbx | 5868640 | c5aeab85a7daa50770f70644b1651ff7811594500a702e8b454e7386566e1df2 |
| Assets/Animations/all_animations_max_motextr_static/m_idle_look_around_01.max.fbx | 1651456 | 018b19ad26695c5ebbd4131e0506da69dc76f4001a8100a9e38fcdb9a202b7a4 |
| Assets/Animations/all_animations_max_motextr_static/m_drink_idle.max.fbx | 5229184 | 44a8183dd457dbbac3e56b8dc93dcec99eb26e9eb10c36d73987ab70beb1f2b2 |
| Assets/Animations/all_animations_max_motextr_static/m_cell_phone_textmessage.max.fbx | 5693776 | fe358efe720533691589b3f16d43bfb7719f51be7ae23abaa66459477fb4250b |
| Assets/Animations/all_animations_max_motextr_static/m_idle_stretch_arms_01.max.fbx | 2060592 | 7430dc57cd72500dd98403efe6c0da5395321e1ac4787007140687248708ee60 |
| Assets/Animations/all_animations_max_motextr_static/f_sit_table_idle_look_around.max.fbx | 1735408 | ff19db71ef6044218915d2561b81488f4399029e54bffafc8fd63444fe9f1aa4 |
| Assets/Animations/all_animations_max_motextr_static/f_sit_table_idle_stretch arms.max.fbx | 2280160 | 3815502ddf2b04054745515dd5091a3dbe7c180203e1fd2e1742eb934e7ceae3 |
| Assets/Animations/all_animations_max_motextr_static/f_sit_table_idle_yawn.max.fbx | 2159248 | 542f467818fda7c5b6afe1e5256fa78decabd106e7d7241644499376a8b379a1 |
| Assets/Animations/all_animations_max_motextr_static/f_sit_table_idle_scratch_head.max.fbx | 1539888 | 993a07de6338fdfabbb28cd65e2634a47461373da5b7952d653496e272e6fa5c |
| Assets/Animations/all_animations_max_motextr_static/f_sit_table_idle_touch_face.max.fbx | 1592496 | b5409ecdf1d28605c35c450297743024b7cca95c4549487ece17ad29607b84db |
| Assets/Animations/all_animations_max_motextr_static/f_sit_table_breathe_01.max.fbx | 3408608 | ebd70602249742fa259e50ef8bcf33d499364d48d6896d929e4a1379c2b65597 |
| Assets/Animations/all_animations_max_motextr_static/f_sit_chair_idle_relaxed_01.max.fbx | 6127488 | 4d7fa1f1fe8f2bd3bee686888cf0d123620b8c35bec2c9aff25d6cd5a8c63388 |
| Assets/Animations/all_animations_max_motextr_static/f_sit_chair_idle_neutral_01.max.fbx | 5562720 | 45a11c11fa22364eb0ea0a0f20c05771aeefa92a7fbe89361eed90e218e58abb |
| Assets/Animations/all_animations_max_motextr_static/f_idle_look_around_01.max.fbx | 1617760 | 61a70b35f08d5308c01fd1bce75ecbdb2cd320193ee900bbef26ad0e9d52261e |
| Assets/Animations/all_animations_max_motextr_static/f_drink_idle.max.fbx | 5017600 | 3e486b8aa0e5d4aac1907536ff04f1c8b55a350095496ad10e513d797f1e1f67 |
| Assets/Animations/all_animations_max_motextr_static/f_cell_phone_textmessage.max.fbx | 3647440 | fec5b09446c1f097d87490005157979a49053cd2462547794b9bdeababdae97b |
| Assets/Animations/all_animations_max_motextr_static/f_idle_stretch_arms_01.max.fbx | 2192688 | 731a81fb08987d4ff4adabdb2f205a90943fde19688d4bafafdd11178c43dcad |

## R1 桌前坐姿补充（2026-10-28，OFFICE-R1-I3B）

Microsoft Rocketbox，MIT。仅导入下列 13 项；原件来自已核对的隔离区 manifest3.json，目标文件名去除 .max，内容逐字节不变。

| 本目录下目标路径 | 字节数 | SHA-256 |
|---|---:|---|
| models/people/anim/f_sit_table_idle_neutral_02.fbx | 3890336 | ee99f393f04211b71251b489db5d17265e2050cd1783e24528ac098d898336f9 |
| models/people/anim/m_sit_table_idle_neutral_02.fbx | 5960992 | 76eddd55dcfcee98e7849ec769d412f1d91d369b78502baf40eeae09bee8e71c |
| models/people/anim/f_sit_table_idle_relaxed_01.fbx | 4759104 | a7dbcae874c4964c64f19e21438b45214a8f059f2d89fbdf14b963b19898e70f |
| models/people/anim/m_sit_table_idle_relaxed_01.fbx | 7158896 | f3c5f5d4b4f9a3fe9f6f103cf09f9fd898db4f06784129be9539f53ec1e6bcbd |
| models/people/anim/f_sit_table_idle_waiting_01.fbx | 4450896 | 047ee274ea779ee413dbe29515c1b422010906d0be30446bcf46eb4ae9ca76c3 |
| models/people/anim/m_sit_table_idle_waiting_01.fbx | 5398576 | b7453f9de0bbb6168f6df71b11fcf3813e5ab568fbf770ed846801592b72ba5e |
| models/people/anim/m_sit_table_idle_nervous_01.fbx | 5712096 | afe96e6cba1e0b141b4f14b397d0f5584ecc5d8dee44d25ea569de2d8ad643e9 |
| models/people/anim/f_sit_table_gestic_shrug_01.fbx | 1024144 | 05f9883101b3b05ad1b7195bbea8d280cc5748fc400c71cb8331439f3f3774a8 |
| models/people/anim/m_sit_table_gestic_shrug_01.fbx | 1601936 | d69cf86c90b0851c6ef1bd8372c35198020d2ccb57c08f9c9dc5985c9dc791c2 |
| models/people/anim/f_sit_table_idle_touch_hair.fbx | 1958544 | 2e89fa2557075fa24f6b92dad4d3991f9cca49b7645959e3d28674aa58abd36f |
| models/people/anim/m_sit_table_idle_touch_hair.fbx | 2414176 | 60bbf0f603aa88065c41da741ee1a24cc682bf134b84e1542d0a386061076314 |
| models/people/anim/f_sit_table_idle_roll_head.fbx | 2153328 | 6951682fa613f0609e00cc3d970a71558546a07a0135db0890fdb139c3fa0014 |
| models/people/anim/m_sit_table_idle_roll_head.fbx | 2374048 | 8fe193eab66b524f203779d46df6553ff6fd7a1b1200946e161415a0a6e57c5d |
