#!/usr/bin/env node

/**
 * PDF Generator using WeasyPrint
 * Generates a single PDF with real navigable bookmarks (from h1/h2/h3),
 * without requiring a LaTeX toolchain or a Chromium download.
 *
 * Prerequisite (see docs/INSTALLATION.md "Documentation toolchain"):
 *   sudo apt-get install -y weasyprint
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { generateHtmlDocument } from './lib/docs-html.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const docsDir = path.join(projectRoot, 'docs')
const outputDir = path.join(projectRoot, 'dist')

function main() {
  console.log('📄 Generating PDF with WeasyPrint...\n')

  try {
    execFileSync('weasyprint', ['--version'], { stdio: 'ignore' })
  } catch {
    console.log('❌ weasyprint not found. Install with:')
    console.log('   sudo apt-get install -y weasyprint\n')
    process.exit(1)
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log('📝 Generating HTML...')
  const html = generateHtmlDocument(docsDir)

  const tempHtmlPath = path.join(outputDir, 'temp-doc.html')
  fs.writeFileSync(tempHtmlPath, html)

  const pdfPath = path.join(outputDir, 'TI89-68000-Documentation.pdf')

  console.log('📄 Rendering to PDF...')
  execFileSync('weasyprint', [tempHtmlPath, pdfPath], { stdio: 'inherit' })

  fs.unlinkSync(tempHtmlPath)

  console.log(`\n✅ PDF generated successfully!`)
  console.log(`📍 Location: ${pdfPath}`)
  console.log(`📊 File size: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`)
}

main()
