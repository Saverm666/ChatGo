import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CHATGPT_ASSISTANT_MESSAGE_SELECTOR,
  CHATGPT_COMPOSER_SELECTOR,
  CHATGPT_MESSAGE_TURN_SELECTOR,
  CHATGPT_SEND_BUTTON_SELECTOR,
  CHATGPT_USER_MESSAGE_SELECTOR
} from './chatgpt.ts'
import { CHATGPT_NATIVE_COMPOSER_CANDIDATES } from './chatgpt-native.ts'
import { listSelectorAlternatives } from '../../main/utils.ts'

// 这些断言把 2026-09 ChatGPT 改版前后的关键 DOM 契约固定下来，
// 避免后续重构误删任一代前端的适配。
// 证据：artifacts/chatgpt-redesign-20260925/

test('轮次选择器同时覆盖旧版桌面端与新版 octane 外壳', () => {
  assert.match(CHATGPT_MESSAGE_TURN_SELECTOR, /\[data-turn-key\]/)
  assert.match(CHATGPT_MESSAGE_TURN_SELECTOR, /\[data-testid\^="conversation-turn-"\]/)
  assert.match(CHATGPT_MESSAGE_TURN_SELECTOR, /\[data-turn\]\[data-turn-id\]/)
  assert.match(CHATGPT_MESSAGE_TURN_SELECTOR, /li\[data-message-role\]/)
  assert.match(CHATGPT_MESSAGE_TURN_SELECTOR, /\[data-conversation-transcript\] > \[data-message-role\]/)
})

test('用户与助手消息选择器同时覆盖两种属性命名', () => {
  assert.match(CHATGPT_USER_MESSAGE_SELECTOR, /\[data-user-message-bubble\]/)
  assert.match(CHATGPT_ASSISTANT_MESSAGE_SELECTOR, /\[data-chatgpt-selection-message-id\]/)
  assert.match(CHATGPT_USER_MESSAGE_SELECTOR, /\[data-message-role="user"\]/)
  assert.match(CHATGPT_USER_MESSAGE_SELECTOR, /\[data-message-author-role="user"\]/)
  assert.match(CHATGPT_ASSISTANT_MESSAGE_SELECTOR, /\[data-message-role="assistant"\]/)
  assert.match(CHATGPT_ASSISTANT_MESSAGE_SELECTOR, /\[data-message-author-role="assistant"\]/)
})

test('输入框选择器覆盖新版 textarea 与 Lexical 两种形态', () => {
  assert.match(CHATGPT_COMPOSER_SELECTOR, /\[data-composer-markdown\]\[contenteditable="true"\]/)
  assert.match(CHATGPT_COMPOSER_SELECTOR, /#prompt-textarea/)
  assert.match(CHATGPT_COMPOSER_SELECTOR, /\[data-mobile-composer-prompt\]/)
  assert.match(CHATGPT_COMPOSER_SELECTOR, /#mobile-composer-prompt/)
  assert.match(CHATGPT_COMPOSER_SELECTOR, /\[data-octane-lexical-root\]\[contenteditable="true"\]/)
  assert.match(CHATGPT_COMPOSER_SELECTOR, /form\[data-mobile-composer\] textarea/)
})

test('发送按钮选择器覆盖新版 data-composer-submit 且排除停止生成态', () => {
  assert.match(CHATGPT_SEND_BUTTON_SELECTOR, /button\[data-composer-submit\]:not\(\[data-stop-generating\]\)/)
  assert.match(CHATGPT_SEND_BUTTON_SELECTOR, /button\[data-testid="send-button"\]/)
  assert.match(CHATGPT_SEND_BUTTON_SELECTOR, /button\[aria-label="Send message"\]/)
})

test('所有选择器都是非空的逗号分隔列表且不含空项', () => {
  const selectors = [
    CHATGPT_MESSAGE_TURN_SELECTOR,
    CHATGPT_USER_MESSAGE_SELECTOR,
    CHATGPT_ASSISTANT_MESSAGE_SELECTOR,
    CHATGPT_COMPOSER_SELECTOR,
    CHATGPT_SEND_BUTTON_SELECTOR
  ]
  for (const selector of selectors) {
    assert.ok(selector.trim().length > 0)
    for (const part of selector.split(',')) {
      assert.ok(part.trim().length > 0, `空选择器片段：${selector}`)
    }
  }
})

// 2026-09-25 登录态会话页（Windows Chrome，/c/…）实测契约。
// 证据：artifacts/chatgpt-latest-capture-20260925/chatgpt-logged-in-conversation.html
test('登录态会话页：轮次/用户消息/助手消息都命中新版标记', () => {
  assert.match(CHATGPT_MESSAGE_TURN_SELECTOR, /\[data-turn-key\]/)
  assert.match(CHATGPT_USER_MESSAGE_SELECTOR, /\[data-user-message-bubble\]/)
  assert.match(CHATGPT_ASSISTANT_MESSAGE_SELECTOR, /\[data-chatgpt-selection-message-id\]/)
  // 该形态已没有 data-message-role / data-message-author-role（快照断言见文件末尾），
  // 上面的三个标记是它在适配器里的唯一命中来源。
})

test('输入框选择器排除会话页里的写作块（同样是 ProseMirror 且排在输入框之前）', () => {
  assert.match(CHATGPT_COMPOSER_SELECTOR, /\[data-chatgpt-composer\] \[data-composer-markdown\]/)
  assert.match(CHATGPT_COMPOSER_SELECTOR, /:not\(\[data-oai-writing-block-surface\] \*\)/)
  assert.match(CHATGPT_COMPOSER_SELECTOR, /:not\(\[data-testid="chatgpt-writing-block"\] \*\)/)
  // 更精确的分支必须排在宽松的 div.ProseMirror 之前，
  // 因为 branch.findComposer 按书写顺序取首个命中。
  assert.ok(
    CHATGPT_COMPOSER_SELECTOR.indexOf('[data-composer-markdown]') <
      CHATGPT_COMPOSER_SELECTOR.indexOf('div.ProseMirror')
  )
})

// 从聊天或工作分支到“工作”（?surface=work）时，输入框不在 form[data-chatgpt-composer]
// 内；只有不带容器限定的 data-composer-markdown 候选能命中真正的输入框。
// 缺少这条候选时，原生引用链路会在第一步就被判为“不是受支持的输入框”，
// 退回在输入框里写 Markdown 引用（> 引用）。
test('输入框候选覆盖容器不是 form[data-chatgpt-composer] 的工作分支页', () => {
  const parts = listSelectorAlternatives(CHATGPT_COMPOSER_SELECTOR)
  const precise = '[data-composer-markdown][contenteditable="true"]'
  assert.ok(parts.includes(precise), '适配器缺少不带容器限定的 data-composer-markdown 候选')
  assert.ok(CHATGPT_NATIVE_COMPOSER_CANDIDATES.includes(precise), '原生桥接层缺少同一条候选')
  assert.ok(
    parts.indexOf(precise) < parts.findIndex((part) => part.startsWith('div.ProseMirror')),
    'data-composer-markdown 必须排在宽松的 div.ProseMirror 分支之前'
  )
})

// 隔离世界与 MAIN world 无法共享 DOM，只能各自按同一份候选顺序解析输入框。
// 两张列表一旦走样，原生附件会被加到另一个编辑区（或直接判为不支持）。
test('原生桥接层与适配器共用同一份输入框候选顺序', () => {
  const [, ...bridgeParts] = CHATGPT_NATIVE_COMPOSER_CANDIDATES
  // 桥接层多出的首个候选是“form[data-chatgpt-composer] 内任意可编辑节点”的宽松兜底，
  // 其余必须与适配器逐条同序。
  assert.deepEqual(bridgeParts, listSelectorAlternatives(CHATGPT_COMPOSER_SELECTOR))
})

// 用真实抓取的登录态快照做一次契约回归（快照在 .gitignore 里，
// 其它机器上不存在时自动跳过）。
const LOGGED_IN_SNAPSHOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../artifacts/chatgpt-latest-capture-20260925/chatgpt-logged-in-conversation.html'
)
const loggedInHtml = existsSync(LOGGED_IN_SNAPSHOT)
  ? readFileSync(LOGGED_IN_SNAPSHOT, 'utf8')
  : null

test(
  '登录态快照（4 轮对话）里的标记与适配器假设一致',
  { skip: loggedInHtml ? false : '未找到登录态快照，跳过' },
  () => {
    const html = loggedInHtml as string
    const count = (pattern: RegExp) => (html.match(pattern) ?? []).length

    assert.equal(count(/data-turn-key="/g), 4)
    assert.equal(count(/data-user-message-bubble=/g), 4)
    assert.equal(count(/data-chatgpt-selection-message-id="/g), 4)
    assert.equal(count(/data-chatgpt-composer=""/g), 1)
    assert.equal(count(/data-composer-markdown=""/g), 1)

    // 旧版标记在该形态下完全不存在。
    assert.equal(count(/data-message-author-role=/g), 0)
    assert.equal(count(/data-message-id=/g), 0)
    // 输入框为空时站点右侧是“开始语音/听写”按钮，没有发送按钮、
    // 也没有 data-composer-submit，发送按钮只能靠 aria-label 命中。
    assert.equal(count(/data-composer-submit/g), 0)
    assert.equal(count(/data-testid="send-button"/g), 0)

    // 写作块同样是 ProseMirror，且排在真正的输入框之前。
    assert.equal(count(/data-oai-writing-block-surface=""/g), 1)
    assert.ok(
      html.indexOf('data-oai-writing-block-surface') < html.indexOf('data-chatgpt-composer')
    )

    // 公式：KaTeX 自带 TeX annotation，同时祖先带 data-math-source。
    assert.ok(count(/annotation encoding="application\/x-tex"/g) >= 1)
    assert.equal(count(/data-math-source="/g), 2)
  }
)
