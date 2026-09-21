import type { Locale } from './i18n/locales'

// examples/<locale>/NN-name.asm, bundled as raw text. Same code in every
// locale, only the comments are translated (checked in examples.test.ts).
const files = import.meta.glob('../examples/*/*.asm', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

export interface Example {
  id: string // file name, e.g. '01-addition.asm'
  title: string // second line of the file, e.g. '01 - Addition' (already translated)
  code: string
}

export function examplesFor(locale: Locale): Example[] {
  return Object.keys(files)
    .filter((p) => p.startsWith(`../examples/${locale}/`))
    .sort()
    .map((p) => ({
      id: p.split('/').pop()!,
      title: files[p].split('\n')[1].replace(/^;\s*/, ''),
      code: files[p],
    }))
}
