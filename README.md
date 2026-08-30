# ChatGo

ChatGo 是一款 Chrome MV3 扩展，为常用 AI 聊天网站补充公式复制、Markdown 复制、提示词管理、长对话优化、分支提问和输入增强功能。

## 支持的网站

- [ChatGPT](https://chatgpt.com/)
- [DeepSeek](https://chat.deepseek.com/)
- [Gemini](https://gemini.google.com/)
- [通义千问](https://chat.qwen.ai/)

## 安装

### 使用 CRX 安装（推荐）

1. 在项目的 [Releases](https://github.com/Saverm666/ChatGo/releases) 页面下载最新版 `ChatGo-v*.crx`。
2. 在 Chrome 地址栏打开 `chrome://extensions/`。
3. 打开页面右上角的“开发者模式”。
4. 将下载的 `.crx` 文件拖入扩展管理页面，然后确认安装。
5. 安装完成后刷新已经打开的 AI 聊天页面。

> Chrome 可能会根据系统或浏览器安全策略阻止非 Chrome 应用商店来源的 CRX。若拖拽安装被拦截，请下载同一 Release 中的 ZIP，解压后在扩展管理页点击“加载已解压的扩展程序”，选择解压目录。

### 从源码安装

```bash
pnpm install
pnpm build
```

然后打开 `chrome://extensions/`，开启开发者模式，点击“加载已解压的扩展程序”，选择项目中的 `dist/` 目录。

## 使用方法

安装后打开任一支持的网站。点击浏览器工具栏中的 ChatGo 图标可以快速调整复制格式、管理当前站点、查看提示词和公式历史；点击“打开完整设置”可管理全部功能。

- **公式点击复制**：鼠标移到公式上会显示蓝色轮廓，点击即可按设定格式复制。可选择带 `$` 的 LaTeX、纯 LaTeX 或适用于 Word 的 UnicodeMath。
- **选区复制为 Markdown**：框选助手回复中的内容后按 `Ctrl+C`；macOS 使用 `Command+C`。列表、代码块、引用和公式会尽量保留 Markdown 结构。
- **Enter 输入增强**：`Enter` 换行，`Ctrl+Enter` 发送消息。
- **分支提问**：框选助手回复中的内容，点击出现的“分支提问”，ChatGo 会打开新对话并将选区转换为引用内容。
- **长对话虚拟滚动**：离开视口的消息会暂停布局与绘制，靠近时自动恢复，以降低长对话页面的渲染开销。
- **提示词与公式历史**：点击页面上的 ChatGo 悬浮按钮，可新建、搜索、复制、编辑或置顶提示词，也可再次复制最近使用过的公式。
- **站点控制**：可在扩展弹窗或完整设置中启用、停用支持的网站，并维护白名单和黑名单。

悬浮按钮可以拖到页面上的合适位置；不需要的功能可在“完整设置 → 功能开关”中单独关闭。

## 更新

下载新版 CRX 后，再次拖入 `chrome://extensions/` 即可更新。不要删除旧扩展后再安装，否则浏览器中保存的设置、提示词和公式历史可能丢失。

## 开发验证

```bash
pnpm typecheck
pnpm build
```
