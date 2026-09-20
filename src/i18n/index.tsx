import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { LOCALES, type Locale, type MessageKey } from './locales'

export { LOCALE_NAMES, type Locale, type MessageKey } from './locales'

const STORAGE_KEY = 'locale'
const DEFAULT_LOCALE: Locale = 'en'

// First supported language among the browser's preferences ('fr-CA' -> 'fr').
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0]
    if (base in LOCALES) return base as Locale
  }
  return DEFAULT_LOCALE
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in LOCALES) return saved as Locale
  } catch {
    // storage unavailable: fall through to detection
  }
  return detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language])
}

export function translate(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  return LOCALES[locale][key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}

interface I18n {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, params) => translate(DEFAULT_LOCALE, key, params),
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  useEffect(() => {
    document.documentElement.lang = locale
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // not persisted; the choice still applies for this session
    }
  }, [locale])
  return (
    <I18nContext.Provider value={{ locale, setLocale, t: (key, params) => translate(locale, key, params) }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
