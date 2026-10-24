# V3-A2 场景接线与交接

基线：`f0f4632b0a4f77350fd87a66df5e10ef62f63d5b`；合入获准样板 `3c0ffff989a2a60ef610139cd4b50ed22dfe70c2`。未修改布局数据、25 个工位映射、导航或业务模块。

- 入口：`?layout=3&align=1`；样板加 `&officeSample=1`。`app.js:963` 仅两处 `LAYOUT_V3 → OFFICE_LAYOUT`，行数不增加。
- `startOfficeV3` 将实际布局传到注册表，缺布局回退稳定 V3。无 `align=1` 的画面/网格保持基线。
- 7 间封闭房间使用数据门向与 1.5m 门洞；8 个开放区域无房间墙段、门框、悬空墙饰。外围与前厅不变。
- `office-vis2/align-zones.js` 仅由 ALIGN 分支创建：按 kind 铺地，矩形走廊取并集去重，环带直接读 `ring.inner/outer`，目前 6..10m；合并绘制，不增加帧循环。
- 陈设复用样板组装器；避让全部真实工位（1+.6m）、矩形走廊/通道、门外1.5×1.5m与 r<10 区域。跨区域已放组外框也预留1.2m；不能放下整组就记录 skipped。
- 3 个展示功能区在 ALIGN 下采用同一避让器：创意/餐饮为桌椅组，休闲为沙发/小桌组。稳定 V3 仍走原函数。

## 障碍物接口

```js
const zones = scene.userData.officeV3.get('zones')
const boxes = zones.obstacles() // [{ id, x0, x1, z0, z1, y0, y1 }]
const details = zones.furnishings // region / placements / groups / skipped / colliders
```

31 个唯一物件 ID 同时对应实际几何测得的包围盒、隐藏碰撞代理和上述清单；通过注册表已有 `collision.add` 接口提交，销毁时移除自己的碰撞与几何。无业务工位、角色或热点新增。路径接入仍由第3步负责，本卡不证明真人可达性。

| 区域 | 实际物件数 | 说明 |
|---|---:|---|
| west-open | 10 | 两组长桌岛与两组绿植 |
| kb | 4 | 四组绿植，桌岛放不下 |
| product | 1 | 一组绿植，桌岛放不下 |
| eng | 0 | 在固定工位净距与模板尺寸下整组跳过 |
| drlife | 0 | 在固定工位净距与模板尺寸下整组跳过 |
| creative | 5 | 圆桌与四椅 |
| dining | 7 | 圆桌、四椅、两组绿植 |
| leisure | 4 | 两沙发、小桌与绿植 |

## 董事会尺寸裁决与未解决项

吧凳验收改为 **坐垫边缘到台面边缘 ≥0.30m**，不是人物通道宽度。实际 4.200−.280−3.545=.375m；新增边界测试证明 .300 通过、.299 失败。未改座位、坐垫、台面或碰撞布局。

冻结 ALIGN 的 `validateIslandRings`：`{ok:false, errors:['SOFA_BEYOND_COLLISION'], sofaOuterEdge:6.14658759291183}`。沙发中心仍5.8m，外沿超出6m约.147m；保持报告错误，交第3步决定尺寸。5.45m仅是原预览比较样例，本卡不写回布局。

`displayDepartments` / `displayStaff` 在 ALIGN 下返回 `pending:true,status:'待接'`。四角新门向尚未接人物；不沿用旧 south 二分逻辑。稳定 V3 展示模块保持原行为。

## 验证边界

真实浏览器使用静态文件路由和空 `/state` 夹具，外部及非GET被拦截；`/foyer`、`/wall/data` 返回本地404。没有请求生产数据、重启或新增服务。

Node 固定基线哈希覆盖注册表全部已构建网格/实例/世界矩阵/材质与碰撞；该夹具不加载工位GLTF。浏览器另对包含真实25个工位模型的全部办公注册根网格做哈希，稳定V3高/低档、样板关/开四组均与f0f4632一致。浏览器像素差低于同版本重拍噪声，不把它称为全图像素完全相同。

截图与原始数据位于外置工件 `review-artifacts/V3-A2-initial/`，最终版本由其中 `evidence-manifest.json` 绑定。入口 `evidence.html`；详见派单回执。图片不进入Git。

与概念图仍有差距：四角展示室内容待接、工程/工坊陈设受净距约束缺失、办公家具密度及整体明暗不等同概念渲染。布局尺寸冻结，本卡不以移动相机或更改全局光照掩盖这些差异。
