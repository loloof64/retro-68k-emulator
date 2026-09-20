import { LOCALE_NAMES, useI18n, type Locale } from '../i18n'

export default function LanguageSelect() {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className="language-select">
      {t('language')}
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {Object.entries(LOCALE_NAMES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
