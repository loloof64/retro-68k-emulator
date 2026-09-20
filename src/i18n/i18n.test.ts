import { describe, it, expect } from 'vitest'
import { detectLocale, translate } from './index'
import { LOCALES } from './locales'

describe('i18n', () => {
  it('detects the first supported language, defaulting to English', () => {
    expect(detectLocale(['fr-CA', 'en'])).toBe('fr')
    expect(detectLocale(['de', 'es-MX'])).toBe('es')
    expect(detectLocale(['de', 'ja'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })
  it('interpolates parameters', () => {
    expect(translate('fr', 'error.line', { line: 3, message: 'x' })).toBe('Ligne 3 : x')
  })
  it('has no untranslated placeholders: every locale uses the same {params} as English', () => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
    for (const [name, messages] of Object.entries(LOCALES))
      for (const key of Object.keys(LOCALES.en) as (keyof typeof LOCALES.en)[])
        expect(params(messages[key]), `${name}:${key}`).toBe(params(LOCALES.en[key]))
  })
})
