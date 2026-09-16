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
- **TRAP system calls: 6 of 7 planned.** `#0` (exit), `#2`/`#3` (read/write
  pixel), `#4` (clear screen), `#5` (read controller), `#6` (play tone) are
  done. `#1` (print string) is **not** implemented — unlike the others,
  it needs an actual text-rendering subsystem (font/glyph data), which
  doesn't exist anywhere in this codebase. That's a real subsystem-design
  task, not a quick `trapHandlers` entry — don't underestimate it. See
  `docs/OPCODES.md`'s "Why doesn't TRAP #1 (Print String) work yet?".
- **Assembler: not started** (planned — turns `.asm` source into runnable
  bytecode; right now opcodes are hand-assembled as raw words in tests).
- **Debugger/Editor UI: shell only**, not wired to a real CPU execution
  loop (`src/components/Debugger.tsx`'s Step handler is a literal TODO;
  `Editor.tsx` is a bare `<textarea>`, no syntax highlighting).
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
- **Windows portable build: not started.** Laurent wants a no-install
  `.zip` (exe + DLLs) alongside the installer-based release, for both
  `.github/workflows/build.yml` and `docs/user/DOWNLOAD.md`. No release
  has shipped at all yet, so this is a planning item, not a regression.
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
