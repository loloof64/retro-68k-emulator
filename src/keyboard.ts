// Deliberate choice (see docs/user/REFERENCE.md): only visible ASCII and
// Latin-1-accented characters are recognized - no Enter/Backspace/arrows/
// function keys. A program that wants line editing (backspace, cursor
// movement) builds it itself out of these raw characters; the emulator
// only supplies them.
export function charCodeForKey(key: string): number | undefined {
  if (key.length !== 1) return undefined
  const code = key.codePointAt(0)!
  if (code >= 0x20 && code <= 0x7e) return code // visible ASCII
  if (code >= 0xa0 && code <= 0xff) return code // Latin-1 accented/symbols
  return undefined
}

// True while the user is typing into a real UI field (the code editor, a
// toolbar input/select) - keyboard capture must not steal those keys.
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT'
}
