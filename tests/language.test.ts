import { describe, expect, it } from 'vitest'

import { resolveOutputLanguage } from '../src/language.js'

describe('resolveOutputLanguage', () => {
  it('defaults to English', () => {
    expect(resolveOutputLanguage(null)).toEqual({ tag: 'en', label: 'English' })
    expect(resolveOutputLanguage('')).toEqual({ tag: 'en', label: 'English' })
  })

  it('supports common shorthands and names', () => {
    expect(resolveOutputLanguage('en')).toEqual({ tag: 'en', label: 'English' })
    expect(resolveOutputLanguage('english')).toEqual({ tag: 'en', label: 'English' })
    expect(resolveOutputLanguage('de')).toEqual({ tag: 'de', label: 'German' })
    expect(resolveOutputLanguage('german')).toEqual({ tag: 'de', label: 'German' })
    expect(resolveOutputLanguage('Deutsch')).toEqual({ tag: 'de', label: 'German' })
    expect(resolveOutputLanguage('pt-BR')).toEqual({ tag: 'pt-BR', label: 'Portuguese (Brazil)' })
  })
})

