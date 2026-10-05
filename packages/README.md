# packages/ — Virtual AI Office 新架构

这里是按 [ADR-001](../docs/adr/ADR-001-replace-core-preserve-shell.md)（换芯保壳）逐步建立的新架构包。旧 NiuMa 运行时（`bin/`、`src/`、`public/`）保持不变、可继续发布。

| 包 | 内容 | 依赖 | 状态 |
| --- | --- | --- | --- |
| `domain` | 实体、Requirement / Task / Execution 状态机、完成规则、不变量 | 无（编译器禁止使用 Node API） | Stage 0 |
| `events` | 带版本号的事件信封、命名规范、序列化、事件日志接口 | 无 | Stage 0 |
| `executors` | 执行器适配器契约、结构化执行活动 | `domain` | Stage 0（仅契约） |
| `store` | 最小 SQLite schema（迁移）与仓储接口 | `domain`、`events` | Stage 0（schema + 接口） |

目标结构中的其余部分（`apps/server`、`apps/web`、`apps/desktop`、`packages/core`、`engineering`、`artifacts`、`office`、`prompts`、`governance`）在对应 Stage 再建立，见 ADR-001 的迁移策略。

## 命令

```bash
npm install            # 安装开发依赖（typescript、@types/node），并链接工作区包
npm run test:packages  # 编译全部包并运行它们的测试
npm test               # 只运行旧 NiuMa 测试，零依赖（桌面打包 CI 依赖这一点）
npm run test:all       # 两者都运行
```

每个包有两个 TypeScript 工程：`tsconfig.json`（`src/` → `dist/`）和 `tsconfig.spec.json`（`spec/` → `dist-spec/`）。测试文件命名为 `*.spec.ts`、放在 `spec/` 目录，因此根目录的 `node --test` 不会自动发现它们。
