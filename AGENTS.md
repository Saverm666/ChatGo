# ChatGo 工作区规范

## 项目概述
ChatGo 是从 ChatGPT-Voyager 重构的 Chrome MV3 扩展，把 ChatGPT 专属功能普适化到多家 AI 聊天站点。

## 技术栈
- Vue 3 + TypeScript + Vite 6 + @crxjs/vite-plugin
- pnpm（包管理器，不要用 npm/yarn）
- Pinia（状态管理）+ chrome.storage（跨上下文持久化）
- KaTeX（公式渲染）

## 验证命令（每次改动后必须运行）
```bash
pnpm typecheck   # 类型检查（vue-tsc --noEmit）
pnpm build       # 构建到 dist/
```

## 目录结构
- `src/main/` 共享：types、constants、storage、messaging、utils
- `src/background/` service-worker：分支草稿中转、安装初始化
- `src/content/` content script：入口 + 站点适配器 + 功能模块
  - `src/content/sites/` 站点适配器（chatgpt/deepseek/gemini/nextchat/lobechat/generic）
  - `src/content/modules/` 功能模块（formula-copier/markdown-copy/enter-enhancer/collapse/branch/floating-panel）
- `src/popup/` 工具栏弹窗 Vue 应用
- `src/options/` 设置页 Vue 应用
- `src/assets/` 图标、字体、全局样式

## 架构要点
- 所有站点特定选择器收敛到 `src/content/sites/` 的适配器，功能模块只依赖适配器接口
- 悬浮窗用 Shadow DOM 隔离站点样式
- 配色：黑字白底（#0A0A0A / #FFFFFF）+ 淡蓝辅色（#3B82F6），CSS 变量统一管理
- 参考项目：`ChatGPT-Voyager/`（旧版原生 JS 实现，可移植核心逻辑）

## 版本号
初始 0.1.0。每次改动后按 personal-habits skill 递增 z（小修改）或 y（较大改动）。
