// Content script 功能注册表：入口只负责遍历，具体启停细节由各功能定义自己维护。

import type { ChatGoSettings, SiteAdapter } from '@/main/types'
import { formulaCopier } from './formula-copier'
import { markdownCopy } from './markdown-copy'
import { enterEnhancer } from './enter-enhancer'
import { branch } from './branch'
import { floatingPanel } from './floating-panel'
import { conversationNavigator } from './conversation-navigator'

export type ContentFeatureModule = {
  name: string
  settingKeys: Array<keyof ChatGoSettings>
  apply(settings: ChatGoSettings, adapter: SiteAdapter): void | Promise<void>
  disable(): void
}

export const contentFeatureModules: ContentFeatureModule[] = [
  {
    name: '公式复制',
    settingKeys: ['formulaCopierEnabled', 'formulaCopyFormat'],
    apply(settings, adapter) {
      formulaCopier.setCopyFormat(settings.formulaCopyFormat)
      if (settings.formulaCopierEnabled) {
        formulaCopier.enable(adapter)
      } else {
        formulaCopier.disable()
      }
    },
    disable: () => formulaCopier.disable()
  },
  {
    name: 'Markdown 复制',
    settingKeys: ['markdownCopyEnabled', 'markdownFormulaWrapMode'],
    apply(settings, adapter) {
      markdownCopy.setFormulaWrapMode(settings.markdownFormulaWrapMode)
      if (settings.markdownCopyEnabled) {
        markdownCopy.enable(adapter)
      } else {
        markdownCopy.disable()
      }
    },
    disable: () => markdownCopy.disable()
  },
  {
    name: '输入增强',
    settingKeys: ['enterEnhancerEnabled'],
    apply(settings, adapter) {
      if (settings.enterEnhancerEnabled) {
        enterEnhancer.enable(adapter)
      } else {
        enterEnhancer.disable()
      }
    },
    disable: () => enterEnhancer.disable()
  },
  {
    name: '分支提问',
    settingKeys: ['branchEnabled'],
    apply(settings, adapter) {
      if (settings.branchEnabled) {
        branch.enable(adapter)
      } else {
        branch.disable()
      }
    },
    disable: () => branch.disable()
  },
  {
    name: '对话节点导航',
    settingKeys: ['conversationNavigatorEnabled'],
    apply(settings, adapter) {
      if (settings.conversationNavigatorEnabled && adapter.id === 'chatgpt') {
        conversationNavigator.enable(adapter)
      } else {
        conversationNavigator.disable()
      }
    },
    disable: () => conversationNavigator.disable()
  },
  {
    name: '悬浮窗',
    settingKeys: ['floatingPanelEnabled'],
    async apply(settings, adapter) {
      if (settings.floatingPanelEnabled) {
        await floatingPanel.enable(adapter)
      } else {
        floatingPanel.disable()
      }
    },
    disable: () => floatingPanel.disable()
  }
]

export const CONTENT_MODULE_SETTING_KEYS = Array.from(
  new Set(contentFeatureModules.flatMap((module) => module.settingKeys))
)
