import { executeNavigateTool } from './navigate'
import { listSkills } from './skills-store'

export type ReplArgs = {
  title: string
  code: string
}

type BrowserJsResult = {
  ok: boolean
  value?: unknown
  logs?: string[]
  error?: string
}

type ReplResult = {
  output: string
}

const NAVIGATION_PATTERNS = [
  /\bwindow\.location\s*=\s*['"`]/i,
  /\blocation\.href\s*=\s*['"`]/i,
  /\bwindow\.location\.href\s*=\s*['"`]/i,
  /\blocation\.assign\s*\(/i,
  /\blocation\.replace\s*\(/i,
  /\bwindow\.location\.assign\s*\(/i,
  /\bwindow\.location\.replace\s*\(/i,
  /\bhistory\.back\s*\(/i,
  /\bhistory\.forward\s*\(/i,
  /\bhistory\.go\s*\(/i,
]

function validateReplCode(code: string): void {
  for (const pattern of NAVIGATION_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error('Use navigate() instead of window.location/history inside REPL code.')
    }
  }
}

async function ensureAutomationContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/automation.js'],
    })
  } catch {
    // ignore
  }
}

async function sendReplOverlay(
  tabId: number,
  action: 'show' | 'hide',
  message?: string
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'automation:repl-overlay',
      action,
      message: message ?? null,
    })
    return
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const noReceiver =
      msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')
    if (!noReceiver) return
  }

  await ensureAutomationContentScript(tabId)
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'automation:repl-overlay',
      action,
      message: message ?? null,
    })
  } catch {
    // ignore
  }
}

function createConsoleCapture() {
  const lines: string[] = []
  const original = { ...console }
  const format = (args: unknown[]) =>
    args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')

  const wrap =
    (method: keyof Console) =>
    (...args: unknown[]) => {
      lines.push(format(args))
      original[method](...args)
    }

  return {
    lines,
    restore() {
      console.log = original.log
      console.info = original.info
      console.warn = original.warn
      console.error = original.error
    },
    attach() {
      console.log = wrap('log')
      console.info = wrap('info')
      console.warn = wrap('warn')
      console.error = wrap('error')
    },
  }
}

async function hasDebuggerPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ['debugger'] })
}

async function runBrowserJs(fnSource: string): Promise<BrowserJsResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-scripts/automation.js'],
    })
  } catch {
    // ignore (optional; used for native input bridge + picker)
  }

  const skills = await listSkills(tab.url ?? undefined)
  const libraries = skills.map((skill) => skill.library).filter(Boolean)
  const nativeInputEnabled = await hasDebuggerPermission()

  const payload = { fnSource, libraries, nativeInputEnabled }

  const injection: chrome.scripting.ScriptInjection = {
    target: { tabId: tab.id },
    func: (data: { fnSource: string; libraries: string[]; nativeInputEnabled: boolean }) => {
      const logs: string[] = []
      const capture = (...args: unknown[]) => {
        logs.push(
          args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')
        )
      }
      const originalLog = console.log
      console.log = (...args: unknown[]) => {
        capture(...args)
        originalLog(...args)
      }

      const runSnippet = (snippet: string) => {
        const fn = new Function(snippet)
        fn()
      }

      const postNativeInput = (payload: Record<string, unknown>) => {
        if (!data.nativeInputEnabled) {
          throw new Error('Native input requires debugger permission')
        }
        return new Promise((resolve, reject) => {
          const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
          const handler = (event: MessageEvent) => {
            if (event.source !== window) return
            const msg = event.data as {
              source?: string
              requestId?: string
              ok?: boolean
              error?: string
            }
            if (msg?.source !== 'summarize-native-input' || msg.requestId !== requestId) return
            window.removeEventListener('message', handler)
            if (msg.ok) resolve(true)
            else reject(new Error(msg.error || 'Native input failed'))
          }
          window.addEventListener('message', handler)
          window.postMessage({ source: 'summarize-native-input', requestId, payload }, '*')
        })
      }

      const attachNativeHelpers = () => {
        const resolveElement = (selector: string) => {
          const el = document.querySelector(selector)
          if (!el) throw new Error(`Element not found: ${selector}`)
          return el as HTMLElement
        }

        ;(window as unknown as { nativeClick?: (selector: string) => Promise<void> }).nativeClick =
          async (selector: string) => {
            const el = resolveElement(selector)
            const rect = el.getBoundingClientRect()
            await postNativeInput({
              action: 'click',
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            })
          }

        ;(
          window as unknown as { nativeType?: (selector: string, text: string) => Promise<void> }
        ).nativeType = async (selector: string, text: string) => {
          const el = resolveElement(selector)
          el.focus()
          await postNativeInput({ action: 'type', text })
        }

        ;(window as unknown as { nativePress?: (key: string) => Promise<void> }).nativePress =
          async (key: string) => {
            await postNativeInput({ action: 'press', key })
          }

        ;(window as unknown as { nativeKeyDown?: (key: string) => Promise<void> }).nativeKeyDown =
          async (key: string) => {
            await postNativeInput({ action: 'keydown', key })
          }

        ;(window as unknown as { nativeKeyUp?: (key: string) => Promise<void> }).nativeKeyUp =
          async (key: string) => {
            await postNativeInput({ action: 'keyup', key })
          }
      }

      const execute = async () => {
        for (const lib of data.libraries) {
          if (!lib) continue
          runSnippet(lib)
        }
        attachNativeHelpers()
        const fn = new Function(`return (${data.fnSource})`)()
        const value = await fn()
        return { ok: true as const, value, logs }
      }

      return execute()
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false as const, error: message, logs }
        })
        .finally(() => {
          console.log = originalLog
        })
    },
    args: [payload],
  }

  const [result] = await chrome.scripting.executeScript(injection)

  return (result?.result ?? { ok: false, error: 'No result from browserjs()' }) as BrowserJsResult
}

export async function executeReplTool(args: ReplArgs): Promise<ReplResult> {
  if (!args.code?.trim()) throw new Error('Missing code')
  validateReplCode(args.code)

  const usesBrowserJs = args.code.includes('browserjs(')
  let overlayTabId: number | null = null
  if (usesBrowserJs) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      overlayTabId = tab.id
      await sendReplOverlay(overlayTabId, 'show', args.title || 'Running automation')
    }
  }

  const capture = createConsoleCapture()
  capture.attach()

  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (...fnArgs: unknown[]) => Promise<unknown>

  const browserjs = async (fn: unknown) => {
    if (typeof fn !== 'function') throw new Error('browserjs() expects a function')
    const res = await runBrowserJs(fn.toString())
    if (res.logs?.length) {
      capture.lines.push(...res.logs)
    }
    if (!res.ok) throw new Error(res.error || 'browserjs failed')
    return res.value
  }

  const navigate = async (input: { url: string; newTab?: boolean }) => executeNavigateTool(input)
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  try {
    const fn = new AsyncFunction('browserjs', 'navigate', 'sleep', 'console', args.code)
    const result = await fn(browserjs, navigate, sleep, console)
    if (result !== undefined) {
      capture.lines.push(`=> ${typeof result === 'string' ? result : JSON.stringify(result)}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    capture.lines.push(`Error: ${message}`)
  } finally {
    capture.restore()
    if (overlayTabId) {
      await sendReplOverlay(overlayTabId, 'hide')
    }
  }

  return { output: capture.lines.join('\n').trim() || 'Code executed successfully (no output)' }
}
