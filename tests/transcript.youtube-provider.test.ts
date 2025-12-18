import { describe, expect, it, vi } from 'vitest'

import { fetchTranscript } from '../src/content/link-preview/transcript/providers/youtube.js'

describe('YouTube transcript provider module', () => {
  it('returns null when HTML is missing or video id cannot be resolved', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))

    expect(
      await fetchTranscript(
        { url: 'https://www.youtube.com/watch?v=abcdefghijk', html: null, resourceKey: null },
        {
          fetch: fetchMock as unknown as typeof fetch,
          apifyApiToken: null,
          youtubeTranscriptMode: 'auto',
        }
      )
    ).toEqual({ text: null, source: null, attemptedProviders: [] })

    expect(
      await fetchTranscript(
        { url: 'https://www.youtube.com/watch', html: '<html></html>', resourceKey: null },
        {
          fetch: fetchMock as unknown as typeof fetch,
          apifyApiToken: null,
          youtubeTranscriptMode: 'auto',
        }
      )
    ).toEqual({ text: null, source: null, attemptedProviders: [] })
  })

  it('uses apify-only mode and skips web transcript attempts', async () => {
    const html = '<!doctype html><html><head><title>Sample</title></head><body></body></html>'

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.includes('api.apify.com')) {
        return Response.json(
          [{ data: [{ start: '0', dur: '1', text: 'Hello from apify' }] }],
          { status: 200 }
        )
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const result = await fetchTranscript(
      { url: 'https://www.youtube.com/watch?v=abcdefghijk', html, resourceKey: null },
      {
        fetch: fetchMock as unknown as typeof fetch,
        apifyApiToken: 'TOKEN',
        youtubeTranscriptMode: 'apify',
      }
    )

    expect(result.text).toBe('Hello from apify')
    expect(result.source).toBe('apify')
    expect(result.attemptedProviders).toEqual(['apify'])
  })

  it('uses web-only mode and skips apify', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))

    const result = await fetchTranscript(
      {
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        html: '<html></html>',
        resourceKey: null,
      },
      {
        fetch: fetchMock as unknown as typeof fetch,
        apifyApiToken: 'TOKEN',
        youtubeTranscriptMode: 'web',
      }
    )

    expect(result.source).toBe('unavailable')
    expect(result.attemptedProviders).toEqual(['captionTracks', 'unavailable'])
  })
})
