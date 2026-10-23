// Paste into Gemini's top-frame DevTools Console after reloading ChatGo >= 0.16.1.
// This script does not create branches. Use ChatGo normally, then run:
// await chatgoBranchDiagnostic.report()
(async () => {
  if (location.hostname !== 'gemini.google.com') throw new Error('请在 Gemini 页面顶层控制台运行。')
  const command = action => new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const finish = () => { clearTimeout(timer); window.removeEventListener('message', receive) }
    const receive = event => {
      if (event.source !== window || event.origin !== location.origin ||
          event.data?.source !== 'chatgo-diagnostic-extension' || event.data.id !== id) return
      finish()
      const result = event.data.result
      if (result?.ok && result.data) resolve(result.data)
      else reject(new Error(result?.error ?? '诊断程序未返回记录。'))
    }
    const timer = setTimeout(() => {
      finish()
      reject(new Error('诊断桥接无响应：请重新加载 0.16.1 或更高版本扩展、刷新 Gemini，并选择顶层控制台。'))
    }, 5000)
    window.addEventListener('message', receive)
    window.postMessage({ source: 'chatgo-diagnostic-console', action, id }, location.origin)
  })
  const pairs = [
    ['解析轮次', 'source.branch-start', 'source.identity-parsed'],
    ['跨上下文桥接', 'source.identity-parsed', 'api.bridge-received'],
    ['接口等待（网络与服务器）', 'api.fetch-start', 'api.headers-received'],
    ['读取响应体', 'api.headers-received', 'api.body-received'],
    ['解析响应', 'api.body-received', 'api.response-parsed'],
    ['保存草稿', 'source.save-draft-start', 'source.save-draft-end'],
    ['后台开页往返', 'source.open-tab-start', 'source.open-tab-end'],
    ['创建标签页', 'background.create-tab-start', 'background.create-tab-end'],
    ['目标页加载至收到草稿', 'background.navigation-dispatched', 'target.draft-received'],
    ['等待输入框', 'target.composer-wait-start', 'target.composer-ready'],
    ['填入并确认', 'target.insert-start', 'target.insert-confirmed'],
    ['总耗时', 'source.branch-start', 'target.insert-confirmed']
  ]
  const report = async () => {
    const state = await command('report')
    const events = [...state.events].sort((a, b) => a.at - b.at)
    const branches = [...new Set(events.filter(e => e.stage === 'source.branch-start').map(e => e.id))]
    const summary = branches.flatMap(id => pairs.flatMap(([phase, start, end]) => {
      const first = events.find(e => e.id === id && e.stage === start)
      const last = events.find(e => e.id === id && e.stage === end)
      return first && last ? [{ branch: id.slice(0, 8), phase, ms: Math.round(last.at - first.at) }] : []
    }))
    const startup = events.filter(e => e.id.startsWith('page:')).map(e => ({
      tab: e.tabId, stage: e.stage, msFromNavigationStart: Math.round(e.at - Number(e.id.slice(5)))
    }))
    console.table(summary)
    console.table(startup)
    console.table(events.map(e => ({ id: e.id, tab: e.tabId, stage: e.stage,
      msFromRecordingStart: Math.round(e.at - state.startedAt), navigationMs: e.duration })))
    const output = { version: '0.16.1', enabled: state.enabled, summary, startup, events }
    console.log('[ChatGo 分支耗时诊断]', JSON.stringify(output, null, 2))
    if (!branches.length) console.log('暂无分支记录。请执行一次 ChatGo 分支提问后再运行 report()。')
    return output
  }
  window.chatgoBranchDiagnostic = {
    start: () => command('start'),
    report,
    stop: () => command('stop')
  }
  const existing = await command('report')
  if (!existing.enabled) await command('start')
  else await report()
  console.log('[ChatGo] 诊断已开启。执行一次分支提问后运行 await chatgoBranchDiagnostic.report()；结束后运行 await chatgoBranchDiagnostic.stop()。启动耗时：开启后刷新页面，再粘贴此脚本导出记录。')
})().catch(error => console.error('[ChatGo 诊断]', error.message))
