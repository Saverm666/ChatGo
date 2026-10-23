import { inspectAttachmentRuntime, runtimeUrlFromSource, type AttachmentApi, type AttachmentRuntimeReport } from './chatgpt-native-runtime.ts'

export interface NativeLoadReport {
  assets: number
  fetched: number
  fetchFailures: number
  importFailures: number
  runtimes: string[]
  runtimeReports: Record<string, AttachmentRuntimeReport>
  stage: 'assets' | 'runtime' | 'import' | 'api' | 'ready'
}

// Resolve the first usable runtime without waiting for unrelated slow assets.
// Bound both fetch and import work; an ESM import cannot itself be aborted.
export function discoverAttachmentApi(
  urls: string[], expiresAt: number,
  importRuntime: (url: string) => Promise<unknown>,
  knownRuntimes: ReadonlyMap<string, unknown> = new Map()
): Promise<{ api: AttachmentApi | null; report: NativeLoadReport }> {
  const report: NativeLoadReport = {
    assets: urls.length, fetched: 0, fetchFailures: 0, importFailures: 0, runtimes: [], runtimeReports: {}, stage: 'assets'
  }
  const inspect = (url: string, runtime: unknown) => {
    const result = inspectAttachmentRuntime(runtime)
    report.runtimeReports[url] = result.report
    report.stage = 'api'
    return result.api
  }
  // The runtime's module cache is live. Re-scan it when lazy composer modules
  // arrive, even if Resource Timing has since discarded the startup entries.
  for (const [url, runtime] of knownRuntimes) {
    report.runtimes.push(url)
    const api = inspect(url, runtime)
    if (api) { report.stage = 'ready'; return Promise.resolve({ api, report }) }
  }
  const budget = Math.max(0, Math.min(1400, expiresAt - Date.now()))
  if (!urls.length || !budget) return Promise.resolve({ api: null, report })
  return new Promise((resolve) => {
    const requests = new Set<AbortController>()
    const imports = new Map<string, Promise<AttachmentApi | null>>()
    let index = 0
    let active = Math.min(4, urls.length)
    let finished = false
    const finish = (api: AttachmentApi | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      for (const controller of requests) controller.abort()
      if (api) report.stage = 'ready'
      resolve({ api, report: { ...report, runtimes: [...report.runtimes], runtimeReports: { ...report.runtimeReports } } })
    }
    const timer = setTimeout(() => finish(null), budget)
    const worker = async () => {
      while (!finished && index < urls.length) {
        const url = urls[index++]
        const controller = new AbortController()
        requests.add(controller)
        const fetchTimer = setTimeout(() => controller.abort(), Math.min(350, budget))
        let source: string
        try {
          const response = await fetch(url, { cache: 'force-cache', signal: controller.signal })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          source = await response.text()
          if (finished) return
          report.fetched++
          if (report.stage === 'assets') report.stage = 'runtime'
        } catch {
          if (!finished) report.fetchFailures++
          continue
        } finally {
          clearTimeout(fetchTimer)
          requests.delete(controller)
        }
        const runtimeUrl = runtimeUrlFromSource(source, url)
        if (!runtimeUrl) continue
        if (!imports.has(runtimeUrl)) {
          report.runtimes.push(runtimeUrl)
          imports.set(runtimeUrl, Promise.resolve().then(() => importRuntime(runtimeUrl)).then((runtime) => {
            if (finished) return null
            return inspect(runtimeUrl, runtime)
          }).catch(() => {
            if (!finished) {
              report.importFailures++
              if (report.stage !== 'api') report.stage = 'import'
            }
            return null
          }))
        }
        // A stalled import must not block inspection of later assets.
        void imports.get(runtimeUrl)!.then((api) => { if (api) finish(api) })
      }
    }
    for (let count = 0; count < Math.min(4, urls.length); count++) {
      void worker().catch(() => {}).finally(() => {
        if (--active === 0) void Promise.all(imports.values()).then(() => finish(null))
      })
    }
  })
}
