import { fetchWithTimeout } from '../../../fetch-with-timeout.js'
import { normalizeApifyTranscript } from '../../normalize.js'
import { isRecord } from '../../utils.js'

const DEFAULT_APIFY_YOUTUBE_ACTOR = 'faVsWy9VTSNVIhWpR'
const LEGACY_TOPAZ_ACTOR = 'dB9f4B02ocpTICIEY'

type ApifyTranscriptItem = Record<string, unknown> & {
  transcript?: unknown
  transcriptText?: unknown
  text?: unknown
  data?: unknown
}

function normalizeApifyActorId(input: string | null): string {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return DEFAULT_APIFY_YOUTUBE_ACTOR
  if (raw.includes('~')) return raw
  const slashIndex = raw.indexOf('/')
  if (slashIndex > 0 && slashIndex < raw.length - 1) {
    return `${raw.slice(0, slashIndex)}~${raw.slice(slashIndex + 1)}`
  }
  return raw
}

function isLegacyTopazActor(actor: string): boolean {
  return (
    actor === LEGACY_TOPAZ_ACTOR ||
    actor.toLowerCase() === 'topaz_sharingan~youtube-transcript-scraper-1'
  )
}

function normalizePintoTranscript(raw: unknown): string | null {
  if (!isRecord(raw)) return null
  const data = raw.data
  if (!Array.isArray(data)) return null
  const lines: string[] = []
  for (const item of data) {
    if (!isRecord(item)) continue
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (text) lines.push(text)
  }
  return lines.length > 0 ? lines.join('\n') : null
}

export const fetchTranscriptWithApify = async (
  fetchImpl: typeof fetch,
  apifyApiToken: string | null,
  apifyYoutubeActor: string | null,
  url: string
): Promise<string | null> => {
  if (!apifyApiToken) {
    return null
  }

  const actor = normalizeApifyActorId(apifyYoutubeActor)
  const useLegacyBody = isLegacyTopazActor(actor)

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${apifyApiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(useLegacyBody ? { startUrls: [url], includeTimestamps: 'No' } : { videoUrl: url }),
        }),
      },
      45_000
    )

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    if (!Array.isArray(payload)) {
      return null
    }

    for (const item of payload) {
      if (!isRecord(item)) {
        continue
      }
      const recordItem = item as ApifyTranscriptItem
      const normalized =
        normalizeApifyTranscript(recordItem.transcript) ??
        normalizeApifyTranscript(recordItem.transcriptText) ??
        normalizeApifyTranscript(recordItem.text) ??
        normalizePintoTranscript(recordItem.data) ??
        normalizePintoTranscript(recordItem)
      if (normalized) {
        return normalized
      }
    }

    return null
  } catch {
    return null
  }
}
