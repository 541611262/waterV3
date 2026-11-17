# 滤芯更换提醒系统 V4 前端

Vue 3 + TypeScript + Vite + Element Plus。升级计划见 [`../docs/V4升级计划.md`](../docs/V4升级计划.md)。

旧版（V3）仍在仓库根目录，切换前两者并行。

## 常用命令

```bash
npm install          # 安装依赖（国内网络可加 --registry=https://registry.npmmirror.com）
npm run dev          # 本地开发，连接测试环境（.env.development）
npm test             # 单元测试
npm run lint         # 代码检查
npm run typecheck    # 类型检查
npm run build        # 构建正式环境（.env.production）
npm run build:staging  # 构建测试环境（.env.staging）
```

## 测试环境

- 网址：<https://water-test-d9gr3wjltdef589d6-1374271205.tcloudbaseapp.com/v4/>（只连接测试环境 `water-test-d9gr3wjltdef589d6`，页面顶部有黄色「测试环境」标签）
- 本地开发用 8080 端口（`npm run dev`），因为测试环境的安全域名里已有 `localhost:8080`
- 部署到测试环境：

```bash
npm run build:staging
MSYS_NO_PATHCONV=1 tcb hosting deploy dist v4 -e water-test-d9gr3wjltdef589d6   # Git Bash 下必须加 MSYS_NO_PATHCONV=1
```

推送代码或提交 PR 时，GitHub Actions 会自动运行代码检查、类型检查、单元测试和构建（`.github/workflows/ci.yml`）。

## 目录

| 目录 | 内容 |
|---|---|
| `src/lib/` | 与界面无关的纯逻辑（日期、数值、表格导入），都有对应的 `*.test.ts` |
| `src/layouts/` | 页面框架（侧边导航、顶栏） |
| `src/views/` | 各个页面 |
| `src/router/` | 路由与导航菜单 |
| `src/config.ts` | 环境配置（从 `.env.*` 读取） |

## 约定

- 日期一律用 `YYYY-MM-DD` 字符串，"今天"按北京时间（`src/lib/dates.ts`）。单元测试故意在美国中部时区运行，以发现依赖电脑时区的错误。
- 导入导出与《格式样板》19 列兼容（`src/lib/import/fields.ts`）。
- 页面顶部的黄色标签表示当前不是正式环境。
