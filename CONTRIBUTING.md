<!-- origin: 094CY/VideoBuddy -->
# 参与与二次开发

本项目采用非商业研究与学习许可：欢迎在非商业前提下提交缺陷修复、交互改进与文档补充；
请勿将本项目或衍生作品用于任何商业用途。

## 本地运行

    npm ci
    npm run dev          # 后端 3721 / 前端 5173
    npm run build
    npm test

开发模式未设置 `VB_ADMIN_PASSWORD` 时，服务会生成一次性管理员口令并在启动日志打印。

## 提交前检查

- `npx tsc -b` 零错误、`npm run build` 通过、`npm test` 全过
- 界面改动先查 `src/components/ui/` 是否有可复用组件，保持现有语义令牌与组件结构
- 不提交 `.env`、`data/`、`dist/`、`node_modules/` 与真实凭据
- 涉及服务端接口时同步更新 README 的接口说明

## Issue / PR

- Issue 请说明运行环境、复现步骤与期望行为
- PR 请描述改动范围、影响面与验证命令
