export function buildIdleSubtitle({
  inputSummary,
  modelLabel,
  model,
}: {
  inputSummary?: string | null
  modelLabel?: string | null
  model?: string | null
}): string {
  const a = typeof inputSummary === 'string' ? inputSummary.trim() : ''
  const bRaw = typeof modelLabel === 'string' ? modelLabel : typeof model === 'string' ? model : ''
  const b = bRaw.trim()
  const parts = [a, b].filter((p) => p.length > 0)
  return parts.join(' · ')
}
