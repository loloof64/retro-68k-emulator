#!/usr/bin/env node

/**
 * PDF Generator using Puppeteer (Chrome headless)
 * Generates PDF with bookmarks from HTML
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs');
const outputDir = path.join(projectRoot, 'dist');

/**
 * Document structure
 */
const documentStructure = [
  { title: 'Introduction', file: 'README.md', id: 'intro' },
  { title: 'Getting Started', file: 'GETTING_STARTED.md', id: 'getting-started' },
  { title: 'Architecture', file: 'ARCHITECTURE.md', id: 'architecture' },
  { title: 'Opcode Reference', file: 'OPCODES.md', id: 'opcodes' },
  { title: 'API Documentation', file: 'API.md', id: 'api' },
  { title: 'Memory Layout', file: 'MEMORY.md', id: 'memory' },
  { title: 'Examples', file: 'EXAMPLES.md', id: 'examples' },
  { title: 'Installation & Distribution', file: 'INSTALLATION.md', id: 'installation' },
  { title: 'Troubleshooting', file: 'TROUBLESHOOTING.md', id: 'troubleshooting' },
];

/**
 * Convert markdown to HTML
 */
function markdownToHtml(markdown) {
  let html = markdown;

  // Escape HTML entities
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  // Code blocks
  html = html.replace(
    /```(.*?)\n([\s\S]*?)```/g,
    '<pre><code class="$1">$2</code></pre>'
  );

  // Inline code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Lists
  html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  return html;
}

/**
 * Generate HTML document with TOC and bookmarks
 */
function generateHtmlDocument() {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TI-89 68000 Emulator - Documentation</title>
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
    }

    h1:first-child {
      page-break-before: avoid;
    }

    h2 {
      font-size: 1.8em;
      margin: 0.8em 0 0.4em 0;
      color: #0080ff;
    }

    h3 {
      font-size: 1.3em;
      margin: 0.6em 0 0.3em 0;
      color: #0099ff;
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
      TI-89 68000 Emulator
    </h1>
    <h2 style="font-size: 1.5em; color: #666; margin: 0.5em 0;">
      Complete Documentation
    </h2>
    <p style="margin-top: 3em; color: #999;">
      Generated: ${new Date().toISOString().split('T')[0]}
    </p>
  </div>

  <!-- Table of Contents -->
  <div class="toc">
    <h2>Table of Contents</h2>
    <ul>`;

  documentStructure.forEach((section) => {
    html += `
      <li class="toc-level-1">
        <a href="#${section.id}">${section.title}</a>
      </li>`;
  });

  html += `
    </ul>
  </div>

  <!-- Content Sections -->`;

  documentStructure.forEach((section) => {
    const filePath = path.join(docsDir, section.file);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const htmlContent = markdownToHtml(content);

      html += `
  <div class="section" id="${section.id}">
    <h1>${section.title}</h1>
    ${htmlContent}
  </div>`;
    } else {
      console.warn(`⚠️  File not found: ${filePath}`);
    }
  });

  html += `
  <footer>
    <p>TI-89 68000 Emulator Documentation</p>
    <p>© 2026 - All Rights Reserved</p>
  </footer>

</body>
</html>`;

  return html;
}

/**
 * Main function - requires Puppeteer to be installed
 */
async function main() {
  console.log('📄 Generating PDF with Puppeteer...\n');

  try {
    // Check if Puppeteer is available
    let puppeteer;
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch (e) {
      console.log('❌ Puppeteer not found. Install with:');
      console.log('   npm install -D puppeteer\n');
      console.log('Or use an alternative method:');
      console.log('   npm run docs:pdf:pandoc\n');
      process.exit(1);
    }

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate HTML
    console.log('📝 Generating HTML...');
    const html = generateHtmlDocument();

    // Save temporary HTML
    const tempHtmlPath = path.join(outputDir, 'temp-doc.html');
    fs.writeFileSync(tempHtmlPath, html);

    // Launch browser and generate PDF
    console.log('🌐 Launching headless browser...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    console.log('📄 Rendering to PDF...');
    await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' });

    const pdfPath = path.join(outputDir, 'TI89-68000-Documentation.pdf');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
      displayHeaderFooter: true,
      headerTemplate:
        '<div style="font-size: 10px; width: 100%; text-align: center;">TI-89 68000 Emulator Documentation</div>',
      footerTemplate:
        '<div style="font-size: 10px; width: 100%; text-align: center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      printBackground: true,
    });

    await browser.close();

    // Clean up temp file
    fs.unlinkSync(tempHtmlPath);

    console.log(`\n✅ PDF generated successfully!`);
    console.log(`📍 Location: ${pdfPath}`);
    console.log(`📊 File size: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
