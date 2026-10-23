import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

const supportedSiteMatches = [
  'https://chatgpt.com/*',
  'https://chat.deepseek.com/*',
  'https://gemini.google.com/*',
  'https://chat.qwen.ai/*'
]

export default defineManifest({
  manifest_version: 3,
  name: 'ChatGo',
  description: '为多家 AI 聊天站点提供公式复制、Markdown 复制、提示词收藏、对话导航、分支提问与输入增强。',
  version: pkg.version,
  icons: {
    '16': 'src/assets/icons/icon16.png',
    '32': 'src/assets/icons/icon32.png',
    '48': 'src/assets/icons/icon48.png',
    '128': 'src/assets/icons/icon128.png'
  },
  permissions: ['storage', 'tabs'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  action: {
    default_title: 'ChatGo',
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'src/assets/icons/icon16.png',
      '32': 'src/assets/icons/icon32.png',
      '48': 'src/assets/icons/icon48.png'
    }
  },
  options_page: 'src/options/index.html',
  web_accessible_resources: [
    {
      resources: ['fonts/*'],
      matches: supportedSiteMatches
    }
  ],
  content_scripts: [
    {
      matches: ['https://gemini.google.com/*'],
      js: ['src/content/gemini-native-bridge.ts'],
      run_at: 'document_start',
      world: 'MAIN'
    },
    {
      matches: ['https://chatgpt.com/*'],
      js: ['src/content/chatgpt-native-bridge.ts'],
      run_at: 'document_start',
      world: 'MAIN'
    },
    {
      matches: supportedSiteMatches,
      js: ['src/content/index.ts'],
      run_at: 'document_start'
    }
  ]
})
