import type { ImageContent, Message, TextContent, UserMessage } from '@mariozechner/pi-ai'

export type DocumentAttachment = {
  bytes: Uint8Array
  mediaType: string
  filename: string | null
}

export type AnthropicDocumentPrompt = {
  kind: 'anthropic-document'
  text: string
  document: DocumentAttachment
}

export type PromptPayload = string | Array<Message> | AnthropicDocumentPrompt

export function userTextMessage(text: string, timestamp = Date.now()): UserMessage {
  return { role: 'user', content: text, timestamp }
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export function userTextAndImageMessage({
  text,
  imageBytes,
  mimeType,
  timestamp = Date.now(),
}: {
  text: string
  imageBytes: Uint8Array
  mimeType: string
  timestamp?: number
}): UserMessage {
  const parts: Array<TextContent | ImageContent> = [
    { type: 'text', text },
    { type: 'image', data: bytesToBase64(imageBytes), mimeType },
  ]
  return { role: 'user', content: parts, timestamp }
}

export function buildAnthropicDocumentPrompt({
  text,
  document,
}: {
  text: string
  document: DocumentAttachment
}): AnthropicDocumentPrompt {
  return { kind: 'anthropic-document', text, document }
}

export function isAnthropicDocumentPrompt(
  prompt: PromptPayload
): prompt is AnthropicDocumentPrompt {
  return (
    typeof prompt === 'object' &&
    prompt !== null &&
    !Array.isArray(prompt) &&
    (prompt as { kind?: unknown }).kind === 'anthropic-document'
  )
}
