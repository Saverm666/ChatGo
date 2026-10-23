# ChatGo

English | [简体中文](README.zh-CN.md)

ChatGo is a Chrome Manifest V3 extension that adds formula copying, Markdown copying, prompt management, conversation branching, and input enhancements to popular AI chat websites.

## Supported websites

- [ChatGPT](https://chatgpt.com/)
- [DeepSeek](https://chat.deepseek.com/)
- [Gemini](https://gemini.google.com/)
- [Qwen](https://chat.qwen.ai/)

## Installation

### From a release package

1. Download the latest `ChatGo-v*.zip` from [Releases](https://github.com/Saverm666/ChatGo/releases).
2. Extract the entire ZIP into a permanent folder.
3. Open `chrome://extensions/` in Chrome.
4. Enable **Developer mode** in the upper-right corner.
5. Click **Load unpacked** and select the extracted folder that directly contains `manifest.json`.
6. Refresh any AI chat pages that are already open.

### From the repository — no build required

The repository includes a ready-to-load `dist/` folder. You do not need Node.js or build commands to install it.

1. Clone this repository, or click **Code → Download ZIP** on GitHub and extract it completely.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the **`dist/` folder inside the repository**:
   - For a clone named `ChatGo`, select `ChatGo/dist/`.
   - For a downloaded repository ZIP, this is usually `ChatGo-main/dist/`.
4. Confirm that the selected folder directly contains `manifest.json`, then refresh your AI chat pages.

**Select the folder that directly contains `manifest.json`.** For repository installations, this is `dist/`, not the repository root, `src/`, or the ZIP file. For release packages, select the extracted folder containing `manifest.json`.

### After changing the source code

```bash
pnpm install
pnpm build
```

Load the generated `dist/` folder as described above, for example `/your/path/ChatGo/dist/`. After further source changes, run `pnpm build` again and click **Reload** on the extension card in Chrome.

## Usage

Open a supported website after installing the extension. Click the ChatGo icon in the browser toolbar to adjust copy formats, manage the current website, and access prompts and formula history. Use “打开完整设置” (Open full settings) to manage all features.

- **Click to copy formulas:** Hover over a formula to see a blue outline, then click to copy it in your selected format: LaTeX with `$` delimiters, plain LaTeX, or Word-compatible UnicodeMath.
- **Copy selections as Markdown:** Select part of an assistant response and press `Ctrl+C` (`Command+C` on macOS). Lists, code blocks, quotations, and formulas retain their Markdown structure where possible.
- **Input enhancements:** Press `Enter` for a new line and `Ctrl+Enter` to send a message.
- **Conversation branching:** Select text in an assistant response. In ChatGPT, choose “对话分支” (Conversation branch) or “工作分支” (Work branch) from the native selection toolbar. ChatGo uses the page’s native quote state and submission functions where compatible, with a Markdown quote fallback. In Gemini, the “分支提问” (Branch question) button creates a native branch from the selected response, opens it in a new tab, and fills the composer with a Markdown quote while keeping the source conversation open. Other websites use the branch question button.
- **Conversation navigation:** In ChatGPT conversations with at least two loaded user questions, a navigation panel appears on the right. It hides automatically when the website’s own navigation is present. This feature is enabled by default and can be disabled in settings.
- **Prompts and formula history:** Click the floating ChatGo button to create, search, copy, edit, or pin prompts and copy recently used formulas again.
- **Website controls:** Enable or disable supported websites and manage allowlists and blocklists from the popup or full settings page.

Drag the floating button to a convenient position. Individual features can be disabled under “完整设置 → 功能开关” (Full settings → Feature toggles).

## Updating

For a release installation, download the new ZIP and extract it over your existing extension folder. Then click **Reload** on the ChatGo card at `chrome://extensions/`.

For a repository installation, pull the latest changes or replace the repository files with the latest download. Keep the same `dist/` path, click **Reload**, and refresh your AI chat pages.

Keep the installation folder in the same location and reload the existing extension instead of removing it first, so your saved settings, prompts, and formula history are preserved. See the [changelog](CHANGELOG.md) (Chinese) for detailed version changes.

## Development checks

```bash
pnpm typecheck
pnpm build
pnpm test
```
