# ChatGo

[English](README.md) | 简体中文

ChatGo 是一款 Chrome MV3 扩展，为常用 AI 聊天网站补充公式复制、Markdown 复制、提示词管理、分支提问和输入增强功能。

## 支持的网站

- [ChatGPT](https://chatgpt.com/)
- [DeepSeek](https://chat.deepseek.com/)
- [Gemini](https://gemini.google.com/)
- [通义千问](https://chat.qwen.ai/)

## 安装

### 使用 Release 安装包

1. 在项目的 [Releases](https://github.com/Saverm666/ChatGo/releases) 页面下载最新版 `ChatGo-v*.zip`。
2. 将 ZIP 完整解压到一个固定目录；请勿直接选择 ZIP 文件。
3. 在 Chrome 地址栏打开 `chrome://extensions/`。
4. 打开页面右上角的“开发者模式”。
5. 点击“加载已解压的扩展程序”，选择刚才的解压目录。
6. 安装完成后刷新已经打开的 AI 聊天页面。

### 直接使用仓库中的构建产物

仓库已包含构建好的 `dist/`，安装扩展无需先安装 Node.js 或运行构建命令。

1. 克隆本仓库，或在 GitHub 点击 **Code → Download ZIP** 并完整解压。
2. 打开 `chrome://extensions/`，开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择仓库内的 **`dist/` 文件夹**。
   - 克隆到 `ChatGo` 时，选择 `ChatGo/dist/`。
   - 下载仓库 ZIP 后，通常选择 `ChatGo-main/dist/`。
4. 确认所选文件夹内直接包含 `manifest.json`，然后刷新已打开的 AI 聊天页面。

**加载路径必须是包含 `manifest.json` 的目录。** 仓库安装请选择 `dist/`，不要选择仓库根目录、`src/` 或 ZIP 文件。Release 安装包则选择解压后直接包含 `manifest.json` 的目录。

### 修改源码后安装

```bash
pnpm install
pnpm build
```

构建完成后，按上述步骤加载项目中的 `dist/` 目录（例如 `/你的路径/ChatGo/dist/`）。后续修改源码后需要重新运行 `pnpm build`，再到扩展管理页面点击“重新加载”。

## 使用方法

安装后打开任一支持的网站。点击浏览器工具栏中的 ChatGo 图标可以快速调整复制格式、管理当前站点、查看提示词和公式历史；点击“打开完整设置”可管理全部功能。

- **公式点击复制**：鼠标移到公式上会显示蓝色轮廓，点击即可按设定格式复制。可选择带 `$` 的 LaTeX、纯 LaTeX 或适用于 Word 的 UnicodeMath。
- **选区复制为 Markdown**：框选助手回复中的内容后按 `Ctrl+C`；macOS 使用 `Command+C`。列表、代码块、引用和公式会尽量保留 Markdown 结构。
- **Enter 输入增强**：`Enter` 换行，`Ctrl+Enter` 发送消息。
- **分支提问**：框选助手回复中的内容。在 ChatGPT 中可直接从原生选区工具条选择“对话分支”或“工作分支”；新分支优先调用页面的原生引用状态和提交函数，保留选区的 Markdown 结构；站点版本不兼容时回退为 Markdown 引用。Gemini 中点击“分支提问”会从所选回复创建原生分支，在新标签页打开并填入 Markdown 引用，同时保留原会话。其他站点使用“分支提问”按钮。
- **对话节点导航**：ChatGPT 对话有至少两条已加载提问时，右侧显示可点击的提问节点；官方目录出现时自动隐藏。默认开启，可在功能开关中关闭。
- **提示词与公式历史**：点击页面上的 ChatGo 悬浮按钮，可新建、搜索、复制、编辑或置顶提示词，也可再次复制最近使用过的公式。
- **站点控制**：可在扩展弹窗或完整设置中启用、停用支持的网站，并维护白名单和黑名单。

悬浮按钮可以拖到页面上的合适位置；不需要的功能可在“完整设置 → 功能开关”中单独关闭。

## 更新

下载新版 ZIP，将内容解压并覆盖到原来的扩展目录，然后在 `chrome://extensions/` 中点击 ChatGo 卡片上的“重新加载”按钮。请保持解压目录路径不变，也不要先删除旧扩展，否则浏览器中保存的设置、提示词和公式历史可能丢失。

通过仓库安装时，拉取最新代码或下载并覆盖新版仓库文件后，保持原先加载的 `dist/` 路径不变，再点击“重新加载”，最后刷新 AI 聊天页面。详细版本变更见 [更新日志](CHANGELOG.md)。

## 开发验证

```bash
pnpm typecheck
pnpm build
```
