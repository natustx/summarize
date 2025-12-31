import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai'
import { parseSseEvent } from '../../../../src/shared/sse-events.js'
import { parseSseStream } from '../lib/sse'
import { loadSettings } from '../lib/settings'
import { executeAskUserWhichElementTool } from './ask-user-which-element'
import { executeNavigateTool } from './navigate'
import { executeReplTool } from './repl'
import { executeSkillTool, type SkillToolArgs } from './skills'

const TOOL_NAMES = [
  'navigate',
  'repl',
  'ask_user_which_element',
  'skill',
  'summarize',
  'debugger',
] as const

export type AutomationToolName = (typeof TOOL_NAMES)[number]

export function getAutomationToolNames(): AutomationToolName[] {
  return [...TOOL_NAMES]
}

function buildToolResultMessage({
  toolCallId,
  toolName,
  text,
  isError,
  details,
}: {
  toolCallId: string
  toolName: string
  text: string
  isError: boolean
  details?: unknown
}): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [{ type: 'text', text }],
    details,
    isError,
    timestamp: Date.now(),
  }
}

async function getActiveTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url ?? null
}

type SummarizeToolArgs = {
  url?: string
  extractOnly?: boolean
  format?: 'text' | 'markdown'
  markdownMode?: 'off' | 'auto' | 'llm' | 'readability'
  model?: string
  length?: string
  language?: string
  prompt?: string
  timeout?: string
  maxOutputTokens?: string | number
  noCache?: boolean
  firecrawl?: 'off' | 'auto' | 'always'
  preprocess?: 'off' | 'auto' | 'always'
  youtube?: 'auto' | 'web' | 'yt-dlp' | 'apify' | 'no-auto'
  videoMode?: 'auto' | 'transcript' | 'understand'
  timestamps?: boolean
  maxCharacters?: number
}

type SummarizeToolResult = {
  text: string
  details?: Record<string, unknown>
}

async function executeSummarizeTool(args: SummarizeToolArgs): Promise<SummarizeToolResult> {
  const settings = await loadSettings()
  const token = settings.token.trim()
  if (!token) {
    throw new Error('Missing daemon token. Open the side panel setup to pair the daemon.')
  }

  const url = (args.url ?? (await getActiveTabUrl()))?.trim()
  if (!url) throw new Error('Missing URL (no active tab)')

  const format = args.format === 'markdown' ? 'markdown' : 'text'
  const extractOnly = Boolean(args.extractOnly)

  const body: Record<string, unknown> = {
    url,
    mode: 'url',
    format,
    extractOnly,
  }

  const model = args.model ?? settings.model
  if (model) body.model = model
  if (!extractOnly) {
    const length = args.length ?? settings.length
    if (length) body.length = length
  }

  const language = args.language ?? settings.language
  if (language) body.language = language

  const prompt = args.prompt ?? settings.promptOverride
  if (prompt) body.prompt = prompt

  const timeout = args.timeout ?? settings.timeout
  if (timeout) body.timeout = timeout

  const maxOutputTokens = args.maxOutputTokens ?? settings.maxOutputTokens
  if (maxOutputTokens) body.maxOutputTokens = maxOutputTokens

  if (args.noCache) body.noCache = true

  const firecrawl = args.firecrawl ?? settings.firecrawlMode
  if (firecrawl) body.firecrawl = firecrawl

  const markdownMode = args.markdownMode ?? settings.markdownMode
  if (markdownMode) body.markdownMode = markdownMode

  const preprocess = args.preprocess ?? settings.preprocessMode
  if (preprocess) body.preprocess = preprocess

  const youtube = args.youtube ?? settings.youtubeMode
  if (youtube) body.youtube = youtube

  if (args.videoMode) body.videoMode = args.videoMode
  if (typeof args.timestamps === 'boolean') body.timestamps = args.timestamps

  if (typeof args.maxCharacters === 'number' && Number.isFinite(args.maxCharacters)) {
    body.maxCharacters = args.maxCharacters
  } else if (typeof settings.maxChars === 'number' && Number.isFinite(settings.maxChars)) {
    body.maxCharacters = settings.maxChars
  }

  const res = await fetch('http://127.0.0.1:8787/v1/summarize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as
    | { ok: true; id: string }
    | { ok: true; extracted: { content: string } & Record<string, unknown> }
    | { ok: false; error?: string }

  if (!res.ok || !json.ok) {
    const error =
      (json as { error?: string }).error ?? `${res.status} ${res.statusText}`.trim()
    throw new Error(error || 'Summarize failed')
  }

  if (extractOnly) {
    if (!('extracted' in json) || !json.extracted) {
      throw new Error('Missing extracted content')
    }
    return {
      text: json.extracted.content,
      details: json.extracted,
    }
  }

  if (!('id' in json) || !json.id) {
    throw new Error('Missing summarize run id')
  }

  const streamRes = await fetch(`http://127.0.0.1:8787/v1/summarize/${json.id}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!streamRes.ok) throw new Error(`${streamRes.status} ${streamRes.statusText}`)
  if (!streamRes.body) throw new Error('Missing stream body')

  let output = ''
  let meta: Record<string, unknown> | null = null

  for await (const raw of parseSseStream(streamRes.body)) {
    const event = parseSseEvent(raw)
    if (!event) continue
    if (event.event === 'chunk') {
      output += event.data.text
      continue
    }
    if (event.event === 'meta') {
      meta = event.data
      continue
    }
    if (event.event === 'error') {
      throw new Error(event.data.message || 'Summarize failed')
    }
    if (event.event === 'done') break
  }

  const text = output.trim()
  if (!text) {
    throw new Error('Model returned no output')
  }

  return { text, details: meta ?? undefined }
}

async function executeDebuggerTool(args: { action?: string; code?: string }) {
  if (args.action !== 'eval') throw new Error('Unsupported debugger action')
  if (!args.code) throw new Error('Missing code')

  const hasPermission = await chrome.permissions.contains({ permissions: ['debugger'] })
  if (!hasPermission) {
    throw new Error(
      'Debugger permission not granted. Enable it in Options → Automation permissions.'
    )
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')

  const tabId = tab.id
  try {
    await chrome.debugger.attach({ tabId }, '1.3')
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('already attached')) {
      throw err
    }
  }

  try {
    const result = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: args.code,
      returnByValue: true,
    })
    const value = result?.result?.value ?? result?.result ?? null
    const text =
      value == null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    return { text, details: result }
  } finally {
    try {
      await chrome.debugger.detach({ tabId })
    } catch {
      // ignore
    }
  }
}

export async function executeToolCall(toolCall: ToolCall): Promise<ToolResultMessage> {
  try {
    if (toolCall.name === 'navigate') {
      const result = await executeNavigateTool(
        toolCall.arguments as { url: string; newTab?: boolean }
      )
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: `Navigated to ${result.finalUrl}`,
        isError: false,
        details: result,
      })
    }

    if (toolCall.name === 'repl') {
      const result = await executeReplTool(toolCall.arguments as { title: string; code: string })
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: result.output,
        isError: false,
        details: result.files?.length ? { files: result.files } : undefined,
      })
    }

    if (toolCall.name === 'ask_user_which_element') {
      const result = await executeAskUserWhichElementTool(
        toolCall.arguments as { message?: string }
      )
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: `Selected ${result.selector}`,
        isError: false,
        details: result,
      })
    }

    if (toolCall.name === 'skill') {
      const result = await executeSkillTool(toolCall.arguments as SkillToolArgs, getActiveTabUrl)
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: result.text,
        isError: false,
        details: result.details,
      })
    }

    if (toolCall.name === 'debugger') {
      const result = await executeDebuggerTool(
        toolCall.arguments as { action?: string; code?: string }
      )
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: result.text,
        isError: false,
        details: result.details,
      })
    }

    if (toolCall.name === 'summarize') {
      const result = await executeSummarizeTool(toolCall.arguments as SummarizeToolArgs)
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: result.text,
        isError: false,
        details: result.details,
      })
    }

    return buildToolResultMessage({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      text: `Unknown tool: ${toolCall.name}`,
      isError: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildToolResultMessage({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      text: message,
      isError: true,
    })
  }
}
