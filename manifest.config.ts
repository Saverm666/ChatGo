import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'ChatGo',
  description: '为多家 AI 聊天站点提供公式复制、Markdown 复制、提示词收藏、长对话折叠、分支提问与输入增强。',
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
      matches: ['<all_urls>']
    }
  ],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_start'
    }
  ]
})
