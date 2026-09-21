import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

/**
 * Shared markdown -> single-page HTML build used by every docs/*.pdf script.
 * Kept separate so the puppeteer and weasyprint generators don't diverge.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..', '..')

function unescapeHtml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

// Renders a ```mermaid fenced block to a PNG (as a base64 data: URI) via
// mermaid-cli (mmdc), so the PDF gets a real diagram instead of the literal
// Mermaid syntax as text — WeasyPrint has no JS engine, so it can't
// interpret the fence itself the way GitHub/VS Code's Mermaid plugin does.
// PNG rather than SVG: mermaid's SVG output puts every node label in a
// <foreignObject><div>...</div></foreignObject> (so it can do rich-text
// layout), and WeasyPrint's SVG support doesn't render foreignObject
// content at all — every node came out as an empty shape, label-less, with
// the SVG route. Rasterizing sidesteps that entirely at the cost of the
// diagram no longer being vector-crisp/zoomable in the PDF.
//
// Runs synchronously (execFileSync) so the rest of this file's synchronous
// markdown pass doesn't need an async rewrite; each call spawns a headless
// Chrome (chrome-headless-shell, via puppeteer-core under mermaid-cli),
// ~1-2s.
//
// One-time local setup, if not done yet: `npx puppeteer browsers install
// chrome-headless-shell` (see docs/INSTALLATION.md's "Documentation
// toolchain" section). If that's missing, or `mmdc` itself isn't
// installed, this warns and returns null so the caller falls back to a
// plain code block instead of failing the whole doc build.
function renderMermaidToImage(mermaidSource) {
  const mmdcBin = path.join(projectRoot, 'node_modules', '.bin', 'mmdc')
  if (!fs.existsSync(mmdcBin)) {
    console.warn(
      '⚠️  @mermaid-js/mermaid-cli not installed — mermaid diagram(s) will render as plain code blocks. Run: npm install -D @mermaid-js/mermaid-cli'
    )
    return null
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-'))
  const inputPath = path.join(tmpDir, 'diagram.mmd')
  const outputPath = path.join(tmpDir, 'diagram.png')

  try {
    fs.writeFileSync(inputPath, mermaidSource)
    // -s 3: render at 3x so it stays crisp when scaled down to fit the
    // page width (mermaid's default canvas is a modest 800x600).
    const puppeteerConfig = process.env.MERMAID_PUPPETEER_CONFIG // CI: --no-sandbox
    execFileSync(
      mmdcBin,
      ['-i', inputPath, '-o', outputPath, '-b', 'white', '-s', '3', ...(puppeteerConfig ? ['-p', puppeteerConfig] : [])],
      { stdio: 'pipe' }
    )
    const png = fs.readFileSync(outputPath)
    return `data:image/png;base64,${png.toString('base64')}`
  } catch (error) {
    console.warn(`⚠️  Mermaid rendering failed, falling back to a plain code block: ${error.message}`)
    console.warn('   One-time setup, if not done yet: npx puppeteer browsers install chrome-headless-shell')
    return null
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

export const developerDocumentStructure = [
  { title: 'Introduction', file: 'README.md', id: 'intro' },
  { title: 'Getting Started', file: 'GETTING_STARTED.md', id: 'getting-started' },
  { title: 'Architecture', file: 'ARCHITECTURE.md', id: 'architecture' },
  { title: 'Opcode Reference', file: 'OPCODES.md', id: 'opcodes' },
  { title: 'Assembler', file: 'ASSEMBLER.md', id: 'assembler' },
  { title: 'API Documentation', file: 'API.md', id: 'api' },
  { title: 'Memory Layout', file: 'MEMORY.md', id: 'memory' },
  { title: 'Examples', file: 'EXAMPLES.md', id: 'examples' },
  { title: 'Installation & Distribution', file: 'INSTALLATION.md', id: 'installation' },
  { title: 'Troubleshooting', file: 'TROUBLESHOOTING.md', id: 'troubleshooting' },
]

// Mirrors GitHub's heading-to-anchor slug algorithm closely enough for our
// docs' internal `#anchor` links (used by OPCODES.md, INSTALLATION.md, ...).
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

// Converts GFM-style pipe tables (header row + |---|---| separator + body
// rows) to real <table> markup — without this they fall through to the
// paragraph pass and render as one run-on line of "| a | b |" text.
function convertTables(html) {
  const tableRe = /^\|(.+)\|[ \t]*\r?\n\|([ \t:|-]+)\|[ \t]*\r?\n((?:\|.*\|[ \t]*\r?\n?)+)/gm

  const splitRow = (line) => line.split('|').map((cell) => cell.trim())

  return html.replace(tableRe, (_match, headerLine, sepLine, bodyBlock) => {
    const headers = splitRow(headerLine)
    const aligns = splitRow(sepLine).map((cell) => {
      const left = cell.startsWith(':')
      const right = cell.endsWith(':')
      if (left && right) return 'center'
      if (right) return 'right'
      if (left) return 'left'
      return null
    })

    const rows = bodyBlock
      .trim()
      .split(/\r?\n/)
      .map((line) => splitRow(line.replace(/^\|/, '').replace(/\|$/, '')))

    const cellStyle = (i) => (aligns[i] ? ` style="text-align:${aligns[i]}"` : '')

    const thead = headers.map((h, i) => `<th${cellStyle(i)}>${h}</th>`).join('')
    const tbody = rows
      .map((cells) => `<tr>${cells.map((c, i) => `<td${cellStyle(i)}>${c}</td>`).join('')}</tr>`)
      .join('')

    return `<table class="cols-${headers.length}"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>\n`
  })
}

// Groups consecutive `- `/`* ` or `1. ` lines into real <ul>/<ol> blocks.
// The docs only ever use `-` and numbered lists (never `*`), and previously
// only a single, non-repeating `* ` pattern was handled — so every list in
// every doc was falling through to the paragraph pass as raw "- text" lines.
function convertLists(html) {
  const toItems = (block, markerRe) =>
    block
      .trim()
      .split(/\r?\n/)
      .map((line) => `<li>${line.replace(markerRe, '')}</li>`)
      .join('')

  html = html.replace(/^(?:\d+\. .*(?:\r?\n|$))+/gm, (block) => {
    return `<ol>${toItems(block, /^\d+\.\s+/)}</ol>\n`
  })

  html = html.replace(/^(?:[*-] .*(?:\r?\n|$))+/gm, (block) => {
    return `<ul>${toItems(block, /^[*-]\s+/)}</ul>\n`
  })

  return html
}

function markdownToHtml(markdown, filenameToId = {}) {
  let html = markdown

  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Pull code out before anything else touches the text: a lone `*` inside
  // an asm example (e.g. `y * 320`) would otherwise be parsed as an <em>
  // marker by the emphasis pass below and silently eaten. Restored verbatim
  // at the very end, after the paragraph pass, so embedded blank lines in a
  // fenced block don't get split into separate <p> tags either.
  const codeSnippets = []
  const stashCode = (htmlSnippet) => {
    codeSnippets.push(htmlSnippet)
    return '@@CODE' + (codeSnippets.length - 1) + '@@'
  }
  html = html.replace(/```(.*?)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    if (lang.trim() === 'mermaid') {
      const dataUri = renderMermaidToImage(unescapeHtml(code))
      if (dataUri) return stashCode(`<div class="mermaid-diagram"><img src="${dataUri}" alt="diagram"></div>`)
    }
    return stashCode(`<pre><code class="${lang}">${code}</code></pre>`)
  })
  html = html.replace(/`([^`]+)`/g, (_, code) => stashCode(`<code>${code}</code>`))

  html = convertTables(html)
  html = convertLists(html)

  // Section-level h1's already get their id from the enclosing .section div
  // (documentStructure below), so only sub-headings need slugged ids here —
  // giving h1 one too would collide with a same-titled top div.
  html = html.replace(/^### (.*?)$/gm, (_, t) => `<h3 id="${slugify(t)}">${t}</h3>`)
  html = html.replace(/^## (.*?)$/gm, (_, t) => `<h2 id="${slugify(t)}">${t}</h2>`)
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>')

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

  // Convert relative .md links to internal anchors for PDF generation.
  // Text and path groups are restricted away from `]`/`)` (no lazy `.*?`)
  // so a link that fails to match here (e.g. an unhandled path shape)
  // can't make this pattern backtrack across unrelated content looking for
  // a later `.md` link to complete itself with — that previously spliced
  // two unrelated adjacent links into one, e.g. a `./user/PRESENTATION.md`
  // path (subdirectory, which the old prefix group couldn't express) got
  // absorbed into the next successfully-matching link far below it.
  html = html.replace(/\[([^\]]*)\]\(((?:\.\/)?(?:[A-Za-z_-]+\/)*)([A-Za-z_-]+)\.md(#[^\)]*)?\)/g, (_match, text, prefix, filename, anchor) => {
    const targetId = filenameToId[`${filename}.md`]
    if (targetId) {
      // If there's an internal anchor like #section, preserve it; otherwise use the section ID
      const href = anchor || `#${targetId}`
      return `<a href="${href}">${text}</a>`
    }
    // Fall back to the original href if not in our document structure
    return `<a href="${prefix}${filename}.md${anchor || ''}">${text}</a>`
  })

  // General link handler (for any other links)
  html = html.replace(/\[([^\]]*)\]\(((?!\.\/)[^\)]+)\)/g, '<a href="$2">$1</a>')

  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`

  html = html.replace(/@@CODE(\d+)@@/g, (_, i) => codeSnippets[Number(i)])

  return html
}

export function generateHtmlDocument({
  docsDir,
  documentStructure = developerDocumentStructure,
  pageTitle = 'Retro 68K Emulator - Documentation',
  coverTitle = 'Retro 68K Emulator',
  coverSubtitle = 'Complete Documentation',
  footerLine = 'Retro 68K Emulator Documentation',
}) {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background: white;
      padding: 40px;
      max-width: 900px;
      margin: 0 auto;
    }

    h1 {
      font-size: 2.5em;
      margin: 1em 0 0.5em 0;
      page-break-before: always;
      color: #0066cc;
      border-bottom: 3px solid #0066cc;
      padding-bottom: 0.3em;
      bookmark-level: 2;
      bookmark-label: content();
    }

    h1:first-child {
      page-break-before: avoid;
    }

    h2 {
      font-size: 1.8em;
      margin: 0.8em 0 0.4em 0;
      color: #0080ff;
      bookmark-level: 3;
      bookmark-label: content();
    }

    h3 {
      font-size: 1.3em;
      margin: 0.6em 0 0.3em 0;
      color: #0099ff;
      bookmark-level: 4;
      bookmark-label: content();
    }

    p {
      margin: 0.5em 0;
      text-align: justify;
    }

    code {
      background: #f4f4f4;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    pre {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 1em;
      border-radius: 5px;
      overflow-x: auto;
      margin: 1em 0;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    pre code {
      background: none;
      padding: 0;
      color: inherit;
    }

    .mermaid-diagram {
      text-align: center;
      margin: 1.5em 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .mermaid-diagram img {
      max-width: 100%;
      height: auto;
    }

    ul, ol {
      margin-left: 2em;
      margin-top: 0.5em;
      margin-bottom: 0.5em;
    }

    li {
      margin: 0.3em 0;
    }

    a {
      color: #0066cc;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #ddd;
      padding: 0.5em;
      text-align: left;
    }

    /* Instruction-table layout (Mnemonic/Syntax/Sizes/Cycles/Flags/Description):
       an unconstrained table gives Description the same share as narrow
       columns like Sizes or Cycles, so it wraps into many short lines and
       the row towers over its siblings. table-layout: auto (the default)
       also treats a cell's width as a hint, not a rule — actual column
       widths still grow to fit content, so the widths below need the
       fixed layout to have any effect. Fixed layout then makes CSS the
       source of truth, so cell text must be allowed to wrap on its own
       (overflow-wrap) or a long unbreakable token can overflow past its
       column border instead. */
    .cols-6 { table-layout: fixed; }
    .cols-6 td, .cols-6 th { overflow-wrap: break-word; }
    /* Smaller header font: at the body's 1em, single-word headers like
       "Mnemonic"/"Description" need ~18-19% width just to avoid a mid-word
       break, which starves Description. Shrinking headers (and every
       column's own content, per Laurent) buys back enough width for
       Description without any column becoming unreadably tight. Sizes and
       Cycles still need a wider share than their headers alone suggest —
       "word (source)" and DIVU/DIVS's "138 (10 on overflow, 38 on zero
       divide)" each contain a single unbreakable word (e.g. "overflow,")
       that sets the real minimum for that column. */
    .cols-6 th { font-size: 0.8em; }
    .cols-6 td { font-size: 0.85em; }
    .cols-6 td:nth-child(2) { font-size: 0.8em; }
    .cols-6 th:nth-child(1), .cols-6 td:nth-child(1) { width: 15%; }
    .cols-6 th:nth-child(2), .cols-6 td:nth-child(2) { width: 16%; }
    .cols-6 th:nth-child(3), .cols-6 td:nth-child(3) { width: 14%; }
    .cols-6 th:nth-child(4), .cols-6 td:nth-child(4) { width: 14%; }
    .cols-6 th:nth-child(5), .cols-6 td:nth-child(5) { width: 12%; }
    .cols-6 th:nth-child(6), .cols-6 td:nth-child(6) { width: 29%; }

    th {
      background: #f5f5f5;
      font-weight: bold;
    }

    .toc {
      break-after: page;
      margin-bottom: 2em;
    }

    .toc h2 {
      margin-bottom: 1em;
    }

    .toc ul {
      list-style-type: none;
      margin-left: 0;
    }

    .toc li {
      margin: 0.3em 0;
    }

    .toc a {
      text-decoration: none;
      color: #0066cc;
    }

    .toc-level-1 {
      font-weight: bold;
      font-size: 1.1em;
      margin-top: 0.8em;
    }

    .toc-level-2 {
      margin-left: 1.5em;
      font-size: 0.95em;
    }

    /* break-before (not break-after on .section itself) so the very last
       section never forces a page break after it — .section:last-child
       can't be used for that here since <footer> follows the sections as
       a sibling, making the last .section not actually body's last child. */
    .section + .section {
      break-before: page;
    }

    footer {
      text-align: center;
      color: #999;
      font-size: 0.9em;
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid #ddd;
    }

    strong {
      font-weight: bold;
    }

    em {
      font-style: italic;
    }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div style="text-align: center; padding: 4em 0;">
    <h1 style="font-size: 3em; margin: 1em 0; border: none; padding: 0; bookmark-level: 1;">
      ${coverTitle}
    </h1>
    <h2 style="font-size: 1.5em; color: #666; margin: 0.5em 0; bookmark-level: none;">
      ${coverSubtitle}
    </h2>
    <p style="margin-top: 3em; color: #999;">
      Generated: ${new Date().toISOString().split('T')[0]}
    </p>
  </div>

  <!-- Table of Contents -->
  <div class="toc">
    <h2 style="bookmark-level: 2;">Table of Contents</h2>
    <ul>`

  documentStructure.forEach((section) => {
    html += `
      <li class="toc-level-1">
        <a href="#${section.id}">${section.title}</a>
      </li>`
  })

  html += `
    </ul>
  </div>

  <!-- Content Sections -->`

  // Build a map of filenames -> section IDs for converting relative links to anchors
  const filenameToId = {}
  documentStructure.forEach((section) => {
    filenameToId[section.file] = section.id
  })

  documentStructure.forEach((section) => {
    const filePath = path.join(docsDir, section.file)

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      // Every docs/*.md file opens with its own `# Title` line, redundant
      // with the <h1>{section.title}</h1> this loop already injects below.
      // Left in, markdownToHtml turns it into a *second* <h1>, which isn't
      // just visual duplication: since it's not the section div's first
      // child, h1's `page-break-before: always` rule (further up in this
      // file) fires on it too, forcing an extra near-blank page before
      // every single section's real content.
      const strippedContent = content.replace(/^# .*\r?\n+/, '')
      const htmlContent = markdownToHtml(strippedContent, filenameToId)

      html += `
  <div class="section" id="${section.id}">
    <h1>${section.title}</h1>
    ${htmlContent}
  </div>`
    } else {
      console.warn(`⚠️  File not found: ${filePath}`)
    }
  })

  html += `
  <footer>
    <p>${footerLine}</p>
    <p>Copyleft 2026 — free software</p>
  </footer>

</body>
</html>`

  return html
}
