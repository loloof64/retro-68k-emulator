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

describe('sample program', () => {
  const code = (s: string) => s.split('\n').map((l) => l.replace(/;.*$/, '').trimEnd())
  it('only differs by its comments across locales', () => {
    const en = LOCALES.en['sample.program']
    for (const messages of [LOCALES.fr, LOCALES.es]) expect(code(messages['sample.program'])).toEqual(code(en))
  })
  it('translates its comments', () => {
    expect(LOCALES.fr['sample.program']).not.toBe(LOCALES.en['sample.program'])
    expect(LOCALES.es['sample.program']).not.toBe(LOCALES.en['sample.program'])
  })
})
