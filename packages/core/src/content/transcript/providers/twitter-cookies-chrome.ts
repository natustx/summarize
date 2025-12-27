import { type Cookie, getCookies, toCookieHeader } from '@steipete/sweet-cookie'
import type { CookieExtractionResult, TwitterCookies } from './twitter-cookies-utils.js'
import { createEmptyCookies } from './twitter-cookies-utils.js'

const TWITTER_ORIGINS = ['https://x.com', 'https://twitter.com'] as const
const TWITTER_COOKIE_NAMES = ['auth_token', 'ct0'] as const

function pickTwitterCookies(found: readonly Cookie[], cookies: TwitterCookies): Cookie[] {
  const picked: Cookie[] = []
  for (const cookie of found) {
    if (cookie.name !== 'auth_token' && cookie.name !== 'ct0') continue
    picked.push(cookie)
    if (cookie.name === 'auth_token' && !cookies.authToken) cookies.authToken = cookie.value
    if (cookie.name === 'ct0' && !cookies.ct0) cookies.ct0 = cookie.value
  }
  return picked
}

export async function extractCookiesFromChrome(profile?: string): Promise<CookieExtractionResult> {
  const warnings: string[] = []
  const cookies: TwitterCookies = createEmptyCookies()

  const result = await getCookies({
    url: 'https://x.com',
    origins: [...TWITTER_ORIGINS],
    names: [...TWITTER_COOKIE_NAMES],
    browsers: ['chrome'],
    mode: 'first',
    chromeProfile: profile,
  })
  warnings.push(...result.warnings)

  const picked = pickTwitterCookies(result.cookies, cookies)
  if (picked.length > 0) {
    cookies.cookieHeader = toCookieHeader(picked, { sort: 'name', dedupeByName: true })
  }
  if (cookies.authToken || cookies.ct0) {
    cookies.source = profile ? `Chrome profile "${profile}"` : 'Chrome default profile'
  }

  if (!cookies.authToken && !cookies.ct0) {
    warnings.push(
      'No Twitter cookies found in Chrome. Make sure you are logged into x.com in Chrome.'
    )
  }

  return { cookies, warnings }
}
