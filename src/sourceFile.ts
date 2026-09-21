import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

const filters = [{ name: 'Assembly', extensions: ['asm', 's', 'txt'] }]
export const inTauri = '__TAURI_INTERNALS__' in window

// Native dialogs under Tauri (the webview ignores <a download>); the caller
// falls back to browser APIs otherwise. Resolves to undefined if cancelled.
export async function openSource(): Promise<{ path: string; code: string } | undefined> {
  const path = await open({ filters })
  return path ? { path, code: await readTextFile(path) } : undefined
}

export async function saveSource(code: string): Promise<string | undefined> {
  const path = await save({ filters, defaultPath: 'program.asm' })
  if (path) await writeTextFile(path, code)
  return path ?? undefined
}
