import fs from 'fs'
import path from 'path'

/**
 * Shared markdown -> single-page HTML build used by every docs/*.pdf script.
 * Kept separate so the puppeteer and weasyprint generators don't diverge.
 */

export const developerDocumentStructure = [
  { title: 'Introduction', file: 'README.md', id: 'intro' },
  { title: 'Getting Started', file: 'GETTING_STARTED.md', id: 'getting-started' },
  { title: 'Architecture', file: 'ARCHITECTURE.md', id: 'architecture' },
  { title: 'Opcode Reference', file: 'OPCODES.md', id: 'opcodes' },
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

    return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>\n`
  })
}

function markdownToHtml(markdown) {
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
  html = html.replace(/```(.*?)\r?\n([\s\S]*?)```/g, (_, lang, code) =>
    stashCode(`<pre><code class="${lang}">${code}</code></pre>`)
  )
  html = html.replace(/`([^`]+)`/g, (_, code) => stashCode(`<code>${code}</code>`))

  html = convertTables(html)

  // Section-level h1's already get their id from the enclosing .section div
  // (documentStructure below), so only sub-headings need slugged ids here —
  // giving h1 one too would collide with a same-titled top div.
  html = html.replace(/^### (.*?)$/gm, (_, t) => `<h3 id="${slugify(t)}">${t}</h3>`)
  html = html.replace(/^## (.*?)$/gm, (_, t) => `<h2 id="${slugify(t)}">${t}</h2>`)
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>')

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')

  html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>')

  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`

  html = html.replace(/@@CODE(\d+)@@/g, (_, i) => codeSnippets[Number(i)])

  return html
}

export function generateHtmlDocument({
  docsDir,
  documentStructure = developerDocumentStructure,
  pageTitle = 'TI-89 68000 Emulator - Documentation',
  coverTitle = 'TI-89 68000 Emulator',
  coverSubtitle = 'Complete Documentation',
  footerLine = 'TI-89 68000 Emulator Documentation',
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
      bookmark-level: 1;
      bookmark-label: content();
    }

    h1:first-child {
      page-break-before: avoid;
    }

    h2 {
      font-size: 1.8em;
      margin: 0.8em 0 0.4em 0;
      color: #0080ff;
      bookmark-level: 2;
      bookmark-label: content();
    }

    h3 {
      font-size: 1.3em;
      margin: 0.6em 0 0.3em 0;
      color: #0099ff;
      bookmark-level: 3;
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

    ul {
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

    th, td {
      border: 1px solid #ddd;
      padding: 0.5em;
      text-align: left;
    }

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

    .section {
      break-after: page;
    }

    .section:last-child {
      break-after: auto;
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
    <h1 style="font-size: 3em; margin: 1em 0; border: none; padding: 0;">
      ${coverTitle}
    </h1>
    <h2 style="font-size: 1.5em; color: #666; margin: 0.5em 0;">
      ${coverSubtitle}
    </h2>
    <p style="margin-top: 3em; color: #999;">
      Generated: ${new Date().toISOString().split('T')[0]}
    </p>
  </div>

  <!-- Table of Contents -->
  <div class="toc">
    <h2>Table of Contents</h2>
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

  documentStructure.forEach((section) => {
    const filePath = path.join(docsDir, section.file)

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const htmlContent = markdownToHtml(content)

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
    <p>© 2026 - All Rights Reserved</p>
  </footer>

</body>
</html>`

  return html
}
