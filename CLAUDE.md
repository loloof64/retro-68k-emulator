# Retro 68K Emulator — Notes for Claude

This file is auto-loaded into context by Claude Code on every session in this
repo, on any machine. It exists so a session can resume cold, with the full
operating context an earlier session built up — without depending on any
machine-local memory. Keep it in sync with reality as the project evolves;
stale entries here are worse than no entry.

## What this project is

A Motorola 68000 CPU emulator (TypeScript + React + Tauri), styled as a
retro fantasy console: 320×200 RGBA framebuffer, a simple gamepad, a
single-voice tone generator, memory-mapped I/O, and a TRAP-based
system-call layer. See `README.md` for the pitch and `docs/ARCHITECTURE.md`
for the technical design.

## Tools to install on a new machine

1. **Node.js 16+** and npm — then `npm install` at the repo root (installs
   frontend deps and the Tauri CLI).
2. **Rust 1.77.2+** via [rustup.rs](https://rustup.rs) — only needed to run
   `npm run tauri:dev` / `tauri:build` (the desktop app shell). Not needed
   for CPU/opcode work, which is pure TypeScript (`npm run test` alone
   needs neither Rust nor a display).
3. **WeasyPrint** (`sudo apt install weasyprint` / `brew install weasyprint`)
   — required for `npm run docs:pdf` / `docs:pdf:user`. Optional unless
   you're touching `docs/*.md`.
4. **poppler-utils** (`sudo apt install poppler-utils` / `brew install
   poppler`) — gives `pdftoppm`/`pdftotext`, used to actually look at a
   regenerated PDF's rendered pages rather than trust the build succeeding
   silently. See "Doc workflow" below for why this matters here specifically.
5. Optional, only for Mermaid diagrams to rasterize into the PDFs (not for
   viewing `.md` files normally): `npx puppeteer browsers install
   chrome-headless-shell`.

Full detail, per-OS notes, and Tauri's platform build tools (Windows/macOS/
Linux native toolchains) are in `docs/INSTALLATION.md` — this list is the
short version for getting productive on CPU/opcode/doc work specifically.

Useful scripts (see `package.json` for the full list): `npm run test`,
`npm run type-check`, `npm run lint`, `npm run docs:pdf`, `npm run
docs:pdf:user`.

## Current status (keep this section updated)

- **68000 instruction set: done.** Every non-privileged real MC68000
  mnemonic is implemented (`src/cpu/opcodes.ts`). The privileged group
  (`MOVE to SR`, `MOVE USP`, `STOP`, `RESET`, `RTE`, and `ANDI`/`ORI`/`EORI
  #imm,SR`) is intentionally out of scope — this emulator has no
  supervisor-mode/status-register model, by design (see
  `docs/user/REFERENCE.md#why-doesnt-this-emulator-implement-rtestopresetmove-sr`).
  No known correctness bugs remain in the implemented set.
- **TRAP system calls: 9 of 9 done.** `#0` (exit), `#1` (print string),
  `#2`/`#3` (read/write pixel), `#4` (clear screen), `#5` (read
  controller), `#6` (play tone), `#7` (delay), `#8` (read keyboard).
  `#1`: `A0` = null-terminated ASCII
  string, `D0`/`D1` = x/y pixel, `D2` = RGBA color; 8×8 `font8x8_basic`
  in `src/graphics/font.ts` (bit 0 = leftmost pixel, kept verbatim from
  upstream — deviates from the earlier "MSB = leftmost" design note),
  transparent background, `\n`/right-edge wrap resets x to 0, no
  scrolling (out-of-screen throws explicitly, since the framebuffer is
  directly followed by the input registers and wouldn't fault by itself).
  - Color format settled as `0xRRGGBBAA` (matches `docs/API.md`; red =
    `0xFF0000FF`) — `docs/MEMORY.md`'s diagram/examples fixed to match.
  - `#7` (2026-09-22ish, before this session): `D0` (word) = delay ms —
    not `D1`, unlike `#6`'s duration field. Sets `cpu.sleepRemainingMs`;
    the debugger's run loop (`src/components/Debugger.tsx`) is what
    actually honors it, differently per Run/Pause/Step — see
    `docs/user/REFERENCE.md#waiting-with-trap-7`.
  - `#8` (2026-09-23, this session): pops the next queued keyboard
    character into `D0` (0 if none pending), written as a full 32-bit
    long, zero-extended — `writeRegister(cpu, Register.D0, memory.popKey(),
    'long')`, same width convention as `#5`/`#2`, not a byte-only write
    like `#6`'s D2/D3 inputs — `SystemMemory.pushKey`/
    `popKey` in `src/memory/index.ts`, a 16-char FIFO, drop-newest on
    overflow. **Not memory-mapped** like every other TRAP here — reading
    the queue has a side effect (pops it), and a raw address would let
    the debugger's read-only Memory Inspector silently consume
    keystrokes just by displaying it; `TRAP #8` is the sole access path.
    Recognizes only visible ASCII (`$20`-`$7E`) and Latin-1 accented
    characters (`$A0`-`$FF`) via `src/keyboard.ts`'s `charCodeForKey`
    (a plain code-point range check on `KeyboardEvent.key` — no lookup
    table needed, and it naturally excludes the Euro sign and the French
    `œ` ligature, both outside Latin-1). Deliberately excludes
    Enter/Backspace/arrows/function keys — a program that wants line
    editing (backspace, cursor movement) builds it itself out of the raw
    characters this TRAP supplies; the emulator doesn't impose one.
    Captured via a `window` keydown listener in `src/App.tsx`, skipped
    whenever `isEditableTarget` says focus is on the code editor or
    another UI field (`src/keyboard.ts`) — works everywhere else with no
    need to click the Screen panel first.
- **Assembler: v1 library implemented** (`src/assembler/`, two-pass,
  `assemble(source)` -> `AssembledProgram | AssemblerError[]`); UI wiring
  pending. Assemblable: every real mnemonic (`CCR`/`SR` are Operand kinds `ccr`/`sr`, valid only in
  MOVE <ea>,CCR / MOVE SR,<ea> / ANDI-ORI-EORI #imm,CCR; MOVEP is `Dn,d(An)` <-> `d(An),Dn`, always with a displacement).
  MOVEM takes register-list operands (`D0-D2/A0`, an Operand `list` kind).
  PC-relative `d(PC)`/`d(PC,Xn)` and indexed `d(An,Xn)` assemble too (encodeEA takes an `at`
  param = extension words emitted before the operand, since PC-relative is measured from its own
  extension word; MOVEM passes 1). **No assembler chantier left.**
  Known limits: no forward refs to
  EQU/DS counts, absolute always long, no branch relaxation, `BTST #n,d(PC)` not
  assemblable. Each mnemonic is encoded by an `encode` field in
  `src/cpu/opcodes.ts`; docs in `docs/ASSEMBLER.md`. Spec:
  `docs/superpowers/specs/2026-09-20-assembler-design.md`, plan:
  `docs/superpowers/plans/2026-09-20-assembler.md`.
  Former deferred follow-ups are done (DC range + odd-address checks, invalid size suffixes rejected via
  `checkSuffix` in `src/assembler/index.ts`, AssemblerError.column points at the operand/label via
  `AsmError`/`evalAt`, test gaps filled). Remaining nits: errors thrown inside an encoder that don't
  come from `ctx.eval` (e.g. range checks) still point at the mnemonic; `END`'s entry expression
  errors point at the mnemonic.
  **UI wiring done**: Debugger assembles (only when the source changed),
  loads `bytecode` at `origin`, runs `step()` (Run = 2000 steps per
  animation frame, Step, Reset), shows registers/flags/PC/cycles, the
  source line of PC (`lineMap`), assembler errors and runtime errors;
  Screen paints the framebuffer (alpha forced opaque) on each `frame`
  bump. Editor: line-number gutter (click = breakpoint), yellow bar on
  the line about to execute (breakpoints follow edits via `src/breakpoints.ts`; fixed 18px line height, no wrapping, so
  the overlay math holds); Run stops on a breakpoint line; a select
  sets instructions per frame. Syntax highlighting: a `<pre>` overlay (`src/highlight.ts`) under a transparent `<textarea>`, scroll-synced; font/padding/line-height must stay identical in both.
- **Debugger memory inspector: done** (`src/components/MemoryView.tsx`, pure helpers in
  `src/memoryView.ts`). Read-only hex+ASCII dump, 8 bytes x 16 rows (a 16-byte row + ASCII
  overflows the 400px column), go-to / pages / shortcuts. Highlights bytes the *program* wrote
  (`SystemMemory.takeWrites()`, capped at 64 bytes per refresh; `setButtonState` and
  `patch8` deliberately don't count), and "Follow writes" (default on) jumps to the last
  written address on Step/Pause, never during Run. Click-to-edit a byte (2 hex digits, Enter =
  store + next byte) via `patch8`, disabled while running; edits are wiped when the program is
  reloaded (Reset, or the first Step/Run). Also: registers are shown D|A side by side to save
  height (panel must fit ~768px without scrolling, check after touching the layout).
- **Bookmarks: done** (`src/marks.ts`, tests in `marks.test.ts`). Ctrl+B / right-click on the gutter toggles, F2 / Shift+F2 jumps (wraps). Bookmarks *and* breakpoints persist in `localStorage` (`retro68k.marks`) keyed by the exact full path — only known under Tauri (`openSource`/`saveSource` return the path); examples, new buffers and the browser build don't persist. Stored lines past EOF are dropped on load; no content check if the file changed externally. Save-as writes the marks under the new path (old entry left).
  A toolbar Previous/Next bookmark button pair (2026-09-25) mirrors F2/Shift+F2: `Editor` is
  wrapped in `forwardRef`/`useImperativeHandle` (`EditorHandle.jumpBookmark(dir)`, exported from
  `src/components/Editor.tsx`) since the caret/scroll logic (`goToLine`) needs the textarea ref
  that lives inside `Editor`, not `App`. Buttons disabled when `bookmarks.size === 0`. New i18n
  keys `bookmark.prev`/`bookmark.next` in all three locales.
  A third toolbar button, "Toggle bookmark" (`bookmark.toggleCurrent`, same group), toggles a
  bookmark on the editor's caret line (same as Ctrl+B) — first tried wiring it to the debugger's
  `currentLine` (the highlighted line about to execute) instead, but that's the wrong "current
  line": Laurent expected it to act on wherever the cursor is in the code, which is also always
  defined, so the button is never disabled. `EditorHandle.toggleBookmarkAtCaret()` (new, alongside
  `jumpBookmark`) reuses the same `caretLine`/`onToggleBookmark` the keyboard shortcut already
  uses.
- **Editor Tab/Shift+Tab/Enter: done** (`src/editorKeys.ts`, pure
  functions unit-tested without a DOM; wired into `Editor.tsx`'s
  `onKeyDown`). Tab inserts spaces to the next 8-column stop (replaces
  the selection, if any — same as typing any other character);
  Shift+Tab removes up to one tab stop of leading spaces from the
  current line; Enter carries the current line's indentation onto the
  new one. Soft tabs only, matching every `.asm` example's existing
  8-space indent — a literal `\t` would render inconsistently across
  the editor, the docs and the generated PDFs. Applied via
  `document.execCommand('insertText'/'delete')`, not a direct
  `textarea.value` assignment — the latter silently wipes the
  browser's native undo/redo stack for that edit (see the item below
  for why that turned out to matter beyond just these three keys).
- **Editor undo/redo: done, but NOT via the browser's native
  text-field undo** (`src/history.ts`, pure + unit-tested;
  `App.tsx` owns the `History` state and a `lastPushAt` ref for
  coalescing). **Important, reusable finding: the Tauri desktop
  build's WebView does not reliably support some standard
  browser-native mechanisms** —
  `document.execCommand`'s undo stack never receives `Ctrl+Z`/`Ctrl+Y`
  there at all (it worked fine in the plain browser build), and
  separately `window.confirm()` can resolve without ever showing a
  dialog there either (see the toolbar item below). Both were
  replaced with app-owned equivalents: an in-memory undo/redo stack
  driven directly by `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` in `Editor.tsx`'s
  `onKeyDown` (plus two toolbar buttons), and `@tauri-apps/plugin-dialog`'s
  `confirm()` (already used for Open/Save) instead of `window.confirm`.
  **When adding any future feature that leans on a native
  browser API for something Tauri-visible (clipboard, dialogs,
  keyboard shortcuts, drag-and-drop, etc.), assume it needs verifying
  under Tauri specifically, not just the browser dev server** — this
  sandbox has no display to run the actual desktop build, so that
  verification has to happen on a machine that can (Laurent's).
  Consecutive edits within 700ms coalesce into one undo step. Loading
  a file/example resets the history; the Debugger's Reset button
  (CPU/memory only) does not. Fixed one bug while building this: a
  ref (`lastPushAt`) read *inside* a `setHistory` updater picked up
  whatever a later keystroke's handler had already written to it by
  the time React got around to invoking that updater — capturing the
  ref into a local *before* calling `setHistory` fixed it.
- **Editor toolbar: done** — replaced the unstyled row of ad-hoc
  buttons with a grouped, styled toolbar (`.toolbar`/`.toolbar-group`/
  `.toolbar-divider`/`.toolbar-button` in `App.css`): File (Open/Save/
  Save As) then a divider then Edit (Undo/Redo), each button greyed
  out when its action isn't available. `Ctrl+O` opens; `Ctrl+S` writes
  straight to the already-known path with **no dialog** (new:
  `writeSource` in `sourceFile.ts` — every save used to show the OS
  picker, even for a file already opened, via the now-renamed
  `saveSourceAs`); `Ctrl+Shift+S` is Save As, always via the picker.
  Save is disabled (button + shortcut, both a no-op) whenever there's
  no known path — an example or the built-in starter program has
  nowhere to write to, only Save As is offered until a location is
  picked. Dirty state is `asmCode !== savedCode` (a comparison, not a
  flag to keep in sync by hand — undoing back to the saved content is
  "clean" again for free). Loading an example or opening a different
  file asks for confirmation first if the buffer is dirty **or** if
  `history.ts`'s `hasEdits(history)` is true (`entries.length > 1`) —
  added 2026-09-23 after Laurent pointed out that undoing back to
  exactly the original content still shouldn't skip the prompt
  silently, since loading something else throws away the redo history
  too, which is its own kind of lost work `asmCode !== savedCode`
  alone can't see. Confirm itself goes through `sourceFile.ts`'s
  `confirmDiscard` — see the undo/redo item above for why that isn't
  `window.confirm` under Tauri.
- **Gamepad UI: implemented** (on-screen + real Gamepad API, auto-switches),
  **including physical-controller visual feedback** (`src/components/
  Controller.tsx`): the polled bitmask is mirrored into a `buttonMask`
  render state, and each on-screen button gets a `.pressed` class
  whenever its bit is set — not just on-screen touches via CSS `:active`
  (kept alongside `.pressed` for zero-latency touch feedback). D-pad/
  Start/Select light up via `background-color: var(--accent)`; A/B/X/Y
  (already colored circles, so a background swap wouldn't show) get a
  glow ring + scale-up + stronger brightness instead
  (`src/components/Controller.css`) — a plain `filter: brightness(1.2)`
  was tried first but was barely perceptible against their already-vivid
  fill colors. Dimming for the disabled on-screen panel (physical
  gamepad connected) moved from the `.controller-layout` container to
  individual buttons, so a currently-pressed button can pop back to full
  opacity instead of being capped at the panel's 0.35 dim like its
  inactive siblings.
- **Windows portable build: implemented, untested in CI.** A
  `Package portable Windows zip` step in `.github/workflows/build.yml`
  zips `Retro68K-Emulator.exe` (+ any `*.dll` left beside it) and attaches
  it to the draft release on tag pushes (artifact on manual runs).
  `src-tauri/.cargo/config.toml` links the MSVC C runtime statically so no
  vcruntime DLL is needed; the WebView2 loader is linked into the exe and
  the WebView2 runtime itself ships with Windows 10/11. `DOWNLOAD.md`
  documents it. **First real check = a `workflow_dispatch` run** (download
  the `portable-windows` artifact, unzip on a clean Windows, run it); the
  `softprops/action-gh-release` draft-attach on tag is the least certain
  part. Releases now exist (0.1.4, 0.2.0); user docs say "at least one version is available".
- **Release 0.1.4 (2026-09-20)**: "Functional assembler with subsets of
  op-codes". Tag `v0.1.4` triggers `.github/workflows/build.yml`: tauri
  installers + Windows portable zip + a `user-guide-pdf` job (runs after
  the platform builds) that attaches `dist-docs/Retro68K-User-Guide.pdf`
  to the draft release. That job needs WeasyPrint 67 via pip (apt's 53.x
  hung in CI) and Chrome (`npx puppeteer browsers install
  chrome-headless-shell`) plus `MERMAID_PUPPETEER_CONFIG` (`--no-sandbox`,
  read by `docs-html.js`) or Mermaid diagrams silently fall back to code
  blocks. A tag build uses the workflow as of the tagged commit, so fix
  the workflow *then* move the tag (force-push). The release body text is
  hardcoded in `build.yml` (the `create-release` job's `body`) — update it per
  release. That job creates the draft once, before the parallel platform
  builds; without it each `tauri-action` job raced to create its own draft
  and assets were split across several drafts (0.4.1: 9 assets instead of 14,
  no error).
- **Release 0.2.0 (2026-09-21)**: "The assembler is complete" (full
  mnemonic coverage, i18n en/fr/es, debugger speed selector). Same tag-driven
  pipeline as 0.1.4; release body in `build.yml` updated. Bump = `package.json`,
  `package-lock.json` (2 spots), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
  + `CHANGELOG.md`.
- **Release 0.5.0 (2026-09-22)**: debugger memory inspector + first-sound latency fix (audio
  context now created on the first click/key anywhere, `src/audio.ts`, instead of on Run). Same
  bump list as 0.2.0; release body in `build.yml` updated.
- **Release 1.0.0 (2026-09-22)**: bookmarks + per-file marks persistence, Run/breakpoint fix. Same bump list as 0.2.0 (+ `src-tauri/Cargo.lock`); release body in `build.yml` updated. Tag `v1.0.0` not pushed by Claude (no credentials): Laurent tags and pushes.
- **Release 1.0.1 (2026-09-22)**: user guide PDF tracked in the repo +
  linked from README, example 14 (Zero Divide exception). Same bump
  list as 0.2.0 (no `src-tauri/Cargo.lock` bump this time — it's
  gitignored and regenerates on its own via a local `cargo` run, not
  something to hand-edit). Tag `v1.0.1` pushed by Laurent, same
  reason as `v1.0.0`.
- **Unreleased since 1.0.1** (`package.json` etc. still say `1.0.1` as
  of this writing): the four editor items above (Tab/Shift+Tab/Enter,
  app-owned undo/redo, the toolbar + Open/Save/Save As/dirty-tracking,
  and the Tauri-safe confirm-discard dialog). Worth a `1.0.2` (or
  `1.1.0` — this is more than a patch's worth of user-visible change)
  once it's been exercised in the real Tauri desktop build, not just
  this sandbox's plain browser dev server — see the undo/redo item's
  note on why that verification has to happen on a machine that can
  actually run it.
- **Release 0.3.0 (2026-09-21)**: gamepad fix. D-pad-as-axes (6/7) + left
  stick read in `gamepadToMask`; under Tauri on Linux `src-tauri/src/lib.rs` polls `gilrs` and
  emits `gamepad-state` events that `Controller.tsx` consumes — and *prefers* them
  over WebKit's Gamepad API (`pickGamepad`): WebKit only exposes a pad after its
  first input and its libmanette mapping is wrong for the Nacon GC-100 (a trigger
  lands on the left stick's Y axis and rests at -1 = "up" held, the D-pad vanishes;
  found via `RETRO68K_GAMEPAD_DEBUG=1`, 0.4.2 AppImage). Linux-only (cfg-gated). Dev port moved to 1420.
  Also on Linux: with `mapping=Driver` (no SDL entry) gilrs calls BTN_X `North` and BTN_Y
  `West`, so `button_order` swaps X/Y for that source (Nacon GC-100 X mode; its O mode uses an
  SDL mapping and needed nothing). **Windows** has no native path: the browser Gamepad API only
  yields a usable pad when `mapping === 'standard'`, so a pad in a non-standard mode (GC-100 O
  mode: mapping "", hat on axis 9) is ignored — a per-device mapping was written then dropped
  (doesn't scale), the guide just says to use the Xbox-style mode. **Exception (untested on hardware)**: a non-standard pad with >9 axes is read as a "hat pad" (D-pad = hat on axis 9, Chromium encoding -1+2/7·i clockwise from up, ~3.29 = rest; face buttons in HID order Y=b0 B=b1 A=b2 X=b3, -/+ = b8/b9) — from the NSW wired controller 20d6:a713 report (`HAT_BUTTON_MAP` in `Controller.tsx`). gilrs-on-Windows was
  considered: its SDL DB has no Windows entry for the GC-100 either, and it can't be tested here.
  Manual `workflow_dispatch` runs create a *draft release named after the branch* (tauri-action
  gets `tagName`) — delete those; branch names with `/` broke the Windows zip name (now fixed).
- **Examples**: `examples/{en,fr,es}/NN-*.asm` (15 programs — #15 added
  2026-09-23, reading the keyboard: polls `TRAP #8` in a loop, builds a
  string up to 10 characters, redraws it with `TRAP #1` after every key,
  exits once the buffer's full. #14 added 2026-09-22, handling the Zero
  Divide exception: installs a handler at
  vector `$40`, catches a `DIVU` by zero; fr/es = same code, translated
  comments, enforced by a test — **the comment-block line *count* must
  match exactly across languages**, not just each line's content (the
  test strips everything from `;` onward per line, so a longer/shorter
  translated paragraph that wraps to a different number of lines breaks
  the comparison; hit this once for #15's fr/es, fixed by tightening the
  wording to fit the same line count as `en`). The 2nd line is the title shown in the editor's "Load an example"
  dropdown, `src/examples.ts` via `import.meta.glob`; picks the current locale) — the `en` ones are
  assembled + run + asserted by `src/assembler/examples.test.ts` (add a
  test + bump its count when adding one). `docs/user/EXAMPLES.md` embeds
  the same code (copied, comments kept <= 66 cols, long comments go on
  their own line above the instruction). `docs/EXAMPLES.md` is flagged
  outdated.
- **Fixed**: `scripts/lib/docs-html.js`'s cross-file-link regex (line
  187) used to have two bugs. (1) Its lazy, unrestricted text-capture
  group `(.*?)` could backtrack across unrelated content when a link's
  path didn't match the pattern (e.g. a multi-level relative path like
  `./user/PRESENTATION.md` — the old `(\.\/)?` prefix only allowed a
  single `./`, not a subdirectory), swallowing everything up to the next
  successfully-matching `.md` link into one broken anchor spanning both.
  (2) Its fallback branch (for links to files outside the current
  document's `filenameToId` map, e.g. `CONTRIBUTING.md`) built the href
  via `match.slice(1, -1)`, which naively stripped only the outer `[`/`)`
  and left the inner `](` glued into the href string. Fixed by
  restricting the text/path capture groups to exclude `]`/`)` (no more
  runaway backtracking) and widening the path group to accept
  subdirectories, plus reconstructing the fallback href from the
  captured groups instead of slicing the raw match. Verified via the
  stray-`](` HTML scan (see "Doc workflow" below) and by visually
  inspecting the regenerated PDF pages for both previously-confirmed
  instances (`docs/README.md`'s `CONTRIBUTING.md` link, `docs/MEMORY.md`'s
  `Presentation` link) — both now render as clean, correctly-bounded
  links.
- **User guide PDF tracked in the repo: done.** `docs/user/Retro68K-User-Guide.pdf`
  is a real, committed file (not gitignored — only `dist-docs/` is),
  linked directly from `README.md` so it doesn't require digging
  through GitHub Releases assets. Kept current two ways: a manual
  `.github/workflows/update-user-guide.yml` (`workflow_dispatch`,
  regenerates + commits to `main` if changed) and, on every tag push,
  an added step at the end of `build.yml`'s existing `user-guide-pdf`
  job that does the same. Both `cp dist-docs/Retro68K-User-Guide.pdf
  docs/user/Retro68K-User-Guide.pdf` after `npm run docs:pdf:user`
  whenever you touch `docs/user/*.md` — it's a tracked binary, so this
  step doesn't show up as "expected, not optional" the way the
  gitignored `dist-docs/` regen does; it's easy to forget. Confirmed
  working: the update-user-guide workflow already committed a
  regenerated PDF as `github-actions[bot]` once, unprompted.
- **Fixed**: PDF-generation `pre` (fenced code blocks) had no
  `break-inside`/`page-break-inside: avoid` in `scripts/lib/docs-html.js`,
  unlike `.mermaid-diagram` and table rows which already did — a code
  block starting near the bottom of a page could get cut mid-block
  instead of moving whole to the next page (found via a user-guide
  worked example split pages 47/48). One-line fix, shared by both PDFs
  since both go through this same stylesheet.

## UI language (i18n)

The UI ships in `en` (default), `fr` and `es`: `src/i18n/locales.ts` (typed
dictionaries; `en` defines the keys, the others must match — a test checks
placeholders), `src/i18n/index.tsx` (`I18nProvider`, `useI18n().t(key, params)`,
auto-detect from `navigator.languages`, choice saved in localStorage, selector
= `LanguageSelect` under the gamepad). **Any new user-visible UI string goes
through `t()` with all three locales — never hardcode text in a component.**
The editor's starter program is the `sample.program` message (comments
translated, code identical — a test enforces it), picked from the locale at
startup only. Not translated: assembler/CPU error messages (English) and the docs.

## Workflow: adding a CPU opcode, TRAP, or memory-mapped feature

The full unit of work, confirmed repeatedly as the expected default (not
optional, not something to ask permission for each time):

1. **Implement** in `src/cpu/opcodes.ts` (or `src/memory/index.ts` for
   layout changes), reusing existing decode helpers (`decodeEA`,
   `decodeControlAddress`, `decodeByteWordLongSize`, `subWithFlags`/
   `addWithFlags`, etc.) rather than writing new ones when the shape
   already exists. If the instruction should raise a real 68000 fault
   (not just "not implemented yet"), reuse `raiseException` (see "CPU
   exception system" below) rather than a plain `throw`.
2. **Tests** in the matching `*.test.ts`, hand-assembling opcode words
   (no real assembler exists yet) — follow the existing helper-function
   style already used throughout `opcodes.test.ts`.
3. **Verify**: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all
   clean before moving on. Also run the exhaustive opcode-collision
   scanner if the new instruction shares any opcode-space byte with an
   existing entry (write a throwaway
   `src/cpu/_collision-scan.test.ts` that resolves every word 0-0xFFFF
   against `opcodeTable` and reports words matched by more than one
   entry; delete it after running). When two entries share a mnemonic
   string, verify by `opcodeTable` array index/object identity, not the
   printed mnemonic — two different `OpcodeDefinition`s can print the
   same name.
4. **Docs, every place that tracks status** — not just one file:
   - `docs/OPCODES.md` (dev reference, full per-addressing-mode detail)
   - `docs/user/REFERENCE.md` (user reference — instruction table +
     cycles, using the *actual* flat values the handler returns, not
     aspirational per-mode numbers)
   - `docs/user/PRESENTATION.md` (roadmap status table)
   - `docs/MEMORY.md` / `docs/ARCHITECTURE.md` when memory layout or the
     exception model changes
   See "Doc conventions" below for formatting rules specific to this repo.
5. **Regenerate both PDFs**: `npm run docs:pdf && npm run docs:pdf:user`.
   `dist-docs/` is gitignored so this never shows in `git status` — do it
   anyway, it's expected, not optional.
6. **One commit per logical feature/fix**, not a giant batch commit.

Only compress this (e.g. skip the PDF regen) when there's a stated
concrete time/budget constraint, and say out loud what's being deferred.

## Doc workflow: verify before calling a doc change done

Two checks to run on any docs change, in order — both catch classes of
bug that silently corrupt a PDF without failing the build:

**1. Line-length scan** — WeasyPrint doesn't wrap long lines inside *any*
fenced code block (` ``` `, not just ` ```asm `), so a too-long line
silently spills past the dark code box's right edge, invisible unless you
look. Empirical safe width: **~66 characters** per line inside a fenced
block (measured by comparing rendered pages). Scan before regenerating —
**track fence state line-by-line, don't use a regex spanning the whole
` ```...``` ` pair**: a naive regex misfires across a ` ```mermaid ` block's
*closing* fence (indistinguishable from a bare opening fence once the
`mermaid` tag itself has scrolled out of the lookahead), silently
swallowing real prose in between as a false positive:

```python
for path in ['docs/OPCODES.md', 'docs/user/REFERENCE.md', 'docs/MEMORY.md', 'docs/user/PRESENTATION.md']:
    in_fence, lang = False, None
    for lineno, line in enumerate(open(path), 1):
        stripped = line.rstrip('\n')
        if stripped.startswith('```'):
            in_fence, lang = (not in_fence), (stripped[3:].strip() if not in_fence else None)
            continue
        if in_fence and lang != 'mermaid' and len(stripped) > 66:
            print(path, lineno, len(stripped), repr(stripped))
```

**2. Split/collision link scan** — a markdown link split across a source
line-wrap, or two adjacent links that trigger the regex-backtracking bug
noted in "Current status" above, both render as literal broken bracket
text instead of a hyperlink. Neither fails the build; WeasyPrint's own
"No anchor" warning only catches some of these. Two ways to check, in
increasing order of thoroughness:
- Quick: `grep -rn '\](' docs/` after eyeballing anything you added, or
  scan for split links with
  `python3 -c "import re; [print(p, m.group()) for p in [...] for m in re.finditer(r'\[[^\]]*\n[^\]]*\]\([^)]*\)', open(p).read())]"`.
- Thorough (catches the backtracking bug, which the above two don't):
  inspect the actual generated HTML directly, since both PDF scripts
  delete their intermediate HTML file (`fs.unlinkSync`) right after
  rendering:
  ```bash
  node -e "
  import('./scripts/lib/docs-html.js').then(({ generateHtmlDocument }) => {
    const html = generateHtmlDocument({ docsDir: './docs' }); // or './docs/user' + documentStructure for the user guide, see scripts/generate-pdf-user-guide.js
    const matches = [...html.matchAll(/\]\(/g)];
    console.log(matches.length, 'stray ]( left');
    for (const m of matches) console.log(JSON.stringify(html.slice(m.index - 60, m.index + 60)));
  });
  "
  ```

**3. After regenerating, actually look at a few pages** (poppler-utils,
installed above):
```bash
pdftotext -layout dist-docs/Retro68K-Documentation.pdf - | awk '/\f/{p++} /Your Heading Text/{print p+1}'
pdftoppm -png -r 100 -f <page> -l <page> dist-docs/Retro68K-Documentation.pdf /tmp/check
```
Then `Read` the resulting PNG. Do this for any page a table/section moved
onto or grew on, not just pages with new content — WeasyPrint has no
`break-inside: avoid` protection everywhere, and a table row can still
straddle a page boundary in edge cases.

## Doc conventions specific to this repo

- **Category grouping, not alphabetical or implementation-order.** Both
  `docs/OPCODES.md` and `docs/user/REFERENCE.md`'s instruction tables are
  grouped like Motorola's own PRM (Data Movement / Arithmetic / Logical /
  Bit Manipulation / Shift and Rotate / Branches / Subroutine Control /
  System), using `###` (h3) subsections — keep new entries in category
  order, not appended at the end.
- **Flags notation**: a flag listed plainly (`N, Z`) reflects the real
  result; `FLAG (0)` (e.g. `V (0)`) means unconditionally cleared; a flag
  simply absent means untouched. Don't invent a fourth phrasing.
- **Instruction-table Description cells: one short sentence max.**
  Anything longer (restrictions, multi-outcome cycle breakdowns, a
  decision procedure) goes in its own linked `###` subsection ("see
  below") near the other deep-dives, not inline — a multi-sentence cell
  visibly breaks the narrow-column PDF table layout.
- **No backtick-wrapped code in a heading you intend to link to by
  anchor.** The markdown converter stashes code spans as opaque
  placeholders *before* slugifying headings, so the resulting anchor id
  depends on an unpredictable placeholder index, not the heading text.
  Write the identifier as plain text in headings; backticks are fine in
  body prose.
- **Never write a literal ` ``` ` inside inline backticks**, even to
  describe fence syntax — the fenced-code regex runs before the inline-code
  regex and doesn't know inline backticks exist yet, so it reads a
  mid-sentence literal fence as a real (unterminated) one and swallows
  everything up to the next real closing fence, silently eating headings
  in between. Describe fence syntax in prose instead (e.g. "a fenced block
  tagged `mermaid`", not the literal triple-backtick).
- **Don't duplicate a `##`/`###` heading text across files that get
  combined into the same PDF** (`scripts/lib/docs-html.js`'s `SECTIONS`
  list for the dev PDF, `documentStructure` in
  `scripts/generate-pdf-user-guide.js` for the user guide) — same-named
  headings collide on anchor id. Link to the existing one instead of
  repeating content.
- **Don't presuppose assembly idioms the reader hasn't been shown yet**
  — see "Working with Laurent" below.
- **Every TRAP must be listed, in vector order (`#0`, `#1`, ...), in
  `docs/user/REFERENCE.md`'s "TRAP System Calls" table.** Same rule as
  the instruction tables above: a one-sentence Description cell, and
  anything longer (multi-step behavior, wrapping/edge-case rules) goes
  in its own linked `###` subsection instead of being crammed inline —
  see `Printing Text with TRAP #1` / `Addressing a Pixel for TRAP #2/#3`
  for the pattern.
- **`docs/EXAMPLES.md`, `docs/QUICK_REFERENCE.md`, and the dev
  `docs/TROUBLESHOOTING.md` are stale placeholder content, not a source
  of truth.** They predate the CPU's real semantics and contain real bugs
  (a `TRAP #1` that still doesn't exist, `DBRA` off-by-ones, a non-real
  `LSRL` mnemonic, a debugger/assembler presupposed as working when
  they're not). Never port an example from them into a user-facing doc
  without hand-tracing it first. `docs/user/TROUBLESHOOTING.md` is the
  real, fresh-written, currently-accurate user-facing version.

## CPU exception system

`raiseException(cpu, memory, vectorAddress, name)` in `src/cpu/opcodes.ts`
pushes the return PC onto A7 (like `JSR`) and jumps to the handler address
stored at `vectorAddress`, throwing a plain JS error only if that vector
is still uninitialized (0). Vectors live in `src/memory/index.ts`, right
after the 64-byte TRAP table: `ZERO_DIVIDE_VECTOR`, `ILLEGAL_INSTRUCTION_VECTOR`,
`CHK_VECTOR`, `TRAPV_VECTOR`.

**Only genuinely-illegal-on-real-hardware encodings and runtime faults**
should raise an exception this way. An instruction/addressing-mode this
emulator simply hasn't implemented yet (but that's valid on real 68000
silicon) must stay a plain JS `throw` — routing it through the vector
mechanism would simulate a fault that wouldn't actually happen on real
hardware. When adding a future opcode that needs a real fault (Address
Error, etc.), add a new vector constant right after the existing ones and
call `raiseException` — don't throw directly.

Deliberate simplification: no SR/supervisor-mode concept exists at all, so
only PC is pushed (never SR) — a handler ends with `RTS`, not real
hardware's `RTE`. `TRAP #n` itself is *not* on this mechanism — it's a
separate, intentional plain dispatch table (`trapHandlers`).

## Working with Laurent

- **Not an experienced assembly programmer**, despite being clearly
  comfortable with software engineering generally (TypeScript, git,
  testing, architecture). Define 68000/assembly-specific terms and idioms
  at first use — addressing modes, condition codes, the fact that a "loop"
  is just a label + backward branch (no loop construct in the CPU itself),
  calling conventions, etc. — rather than assuming prior exposure. This
  doesn't apply to general SWE concepts.
- **Communicates in French**; respond in French unless he switches.
- **Wants the full workflow above by default**, including the PDF
  regeneration step — has explicitly asked for it back when skipped under
  time pressure. Only skip steps when he's stated a concrete constraint,
  and say out loud what's being deferred.
- **Prefers one commit per logical feature**, not batched giant commits.
- **Genuinely reads the rendered output** (PDF pages, not just "the build
  succeeded") — has caught real layout/content bugs this way multiple
  times. Trust that habit; don't skip the visual check to save time.

## Environment notes

- `dist-docs/` (built PDFs) is gitignored — regenerating them never shows
  in `git status`, that's expected.
- If `git push` fails with `could not read Username for 'https://github.com'`
  (no credential helper configured in a sandboxed session), that's an
  environment limitation, not a repo problem — commit normally, mention
  the push failed once, and don't retry repeatedly. Laurent pushes from
  his own terminal when this happens.
- **No display here** — `npm run tauri:dev`/`tauri:build` can't be
  driven or screenshotted from this sandbox. UI work gets verified via
  `npm run dev` + a browser (Playwright MCP in past sessions), which is
  real verification for anything that's plain web-standard, but is
  blind to WebView-specific quirks — see the "Editor undo/redo" status
  item for a concrete case (two native browser APIs that work in the
  dev-server browser but not in the actual Tauri WebView). Flag
  Tauri-specific behavior as unverified rather than assuming the
  browser check covers it, and say so explicitly when reporting done.
- **`tdd-guard` (the Claude Code plugin) can't be wired up in this repo
  yet.** Its Vitest reporter (`tdd-guard-vitest`) requires
  `vitest@>=3.2.4`; this repo is pinned to `vitest@^1.0.0` (`1.6.1`
  installed). `npm install --save-dev tdd-guard-vitest` fails with an
  ERESOLVE peer-dependency error and installs nothing (verified — no
  `package.json`/lock changes from the failed attempt). Don't re-attempt
  the install without first upgrading Vitest 1→3 as its own separate,
  deliberate task (a 2-major-version jump, likely disruptive — not a
  drive-by fix). If `tdd-guard` is enabled (`.claude/tdd-guard/data/
  config.json`'s `guardEnabled`) while this incompatibility stands, it
  blocks every implementation edit with no way to satisfy it (it can't
  see real test results without the reporter) — flip `guardEnabled` to
  `false` in that file directly (Laurent already approved this once,
  2026-09-23) rather than getting stuck re-arguing with it turn after
  turn.
