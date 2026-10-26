# Q-V1 复审报告 · CI-FIX1 R3

- fix/ci-portable-tests @ e0f1fecf10dff05cdf9dde26abb674829744f714（CI 运行 40287877832 针对 0e3ef1f，ubuntu / windows 均 success；e0f1fec 只改 ci.yml 触发条件和回执）
- qa/vis3-test-infra @ c13b10d3550c574ae9b386385503e6b8d9996f35（A7 / A8）
- 回执：fix 分支 dispatch/deepseek/outbox/CI-FIX1-交付-R3.md

## 结论

- **fix/ci-portable-tests：通过。** A1–A6、B1、B3、B4、B5 达标，可以开 PR 合入 main（合并由董事会决定）。
- **A7 / A8（qa/vis3-test-infra）：不通过，需返修 R4。** 两处负向测试没有测到真正的风险。下面的复现脚本在交付代码上直接跑出了问题。

## 逐条

| 项 | 结论 | 说明 |
|---|---|---|
| A1–A6 | 通过 | 同 67b943d 复审；根目录两份重复测试的删除已核实 tests/ 下有更完整版本 |
| B1 Windows #512 | 通过 | 测试 tmp() 改为 fs.realpathSync.native；windows 作业 success；未改产品代码 |
| B3 ci.yml | 通过 | push 只留 main；三步等价于 test:all 已写注释；summary 标题通用 |
| B4 少推送 | 通过 | 两个分支各推 1 次 |
| B5 回执 | 通过 | 按模板；5 项新增跳过逐条列出原因 |
| A7 未运行不得算通过 | **不通过** | `assessRun` 只在报告"带了 sha"时才核对：报告没有 sha 字段时，旧报告直接算通过（复现：`{exit:0, report:{mandatory:{total:9}}}` → ok:true）。用 HEAD sha 当标识也不够：同一提交上残留的上一次报告照样通过。卡片要求的是"与本次运行标识匹配" |
| A8 只清理本次创建的目录 | **不通过** | `removeRegisteredDir` 只判断路径里是否含 `vis3-iso-`，这本身就是按前缀猜归属，并没有登记。复现：新建一个"别的运行"的 `vis3-iso-other-run-*` 目录，调用后被删掉了。负向测试只删了自己的目录、检查另一个还在，没有调用删除另一个，所以测不出来 |

## 产品层发现（回执已报告，待董事会决定）

`evidence-version.mjs` 的 `realOrResolve()` 对不存在的路径不展开 8.3 短名，在短名临时目录下会把"文件缺失"误报成"路径不在允许范围"。只影响错误提示，不影响安全边界（被拒绝的仍是拒绝）。建议另开小卡，非紧急。

## 复现

`node a7a8-probe.mjs <qa/vis3-test-infra 工作树>`，输出：
- A7 旧报告没有 sha 字段: { ok: true }
- A8 删除"别的运行"的同前缀目录: { ok: true } 目录还在? false
