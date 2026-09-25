#!/usr/bin/env node

/**
 * User Guide PDF Generator (WeasyPrint)
 * Bundles docs/user/*.md — written for people who want to USE the app,
 * as opposed to docs/*.md which is for people extending/building it.
 *
 * Prerequisite: sudo apt-get install -y weasyprint (see docs/INSTALLATION.md)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { generateHtmlDocument } from './lib/docs-html.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const docsDir = path.join(projectRoot, 'docs', 'user')
const outputDir = path.join(projectRoot, 'dist-docs')

const documentStructure = [
  { title: 'Presentation', file: 'PRESENTATION.md', id: 'presentation' },
  { title: 'Downloads', file: 'DOWNLOAD.md', id: 'downloads' },
  { title: 'References and Guidelines', file: 'REFERENCE.md', id: 'reference' },
  { title: 'Troubleshooting', file: 'TROUBLESHOOTING.md', id: 'troubleshooting' },
]

const { version } = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

function main() {
  console.log('📄 Generating User Guide PDF with WeasyPrint...\n')

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
  const html = generateHtmlDocument({
    docsDir,
    documentStructure,
    pageTitle: 'Retro 68K Emulator - User Guide',
    coverTitle: 'Retro 68K Emulator (User Guide)',
    coverSubtitle: `Version ${version}`,
    footerLine: 'Retro 68K Emulator — User Guide',
  })

  const tempHtmlPath = path.join(outputDir, 'temp-user-guide.html')
  fs.writeFileSync(tempHtmlPath, html)

  const pdfPath = path.join(outputDir, 'Retro68K-User-Guide.pdf')

  console.log('📄 Rendering to PDF...')
  execFileSync('weasyprint', [tempHtmlPath, pdfPath], { stdio: 'inherit' })

  fs.unlinkSync(tempHtmlPath)

  console.log(`\n✅ PDF generated successfully!`)
  console.log(`📍 Location: ${pdfPath}`)
  console.log(`📊 File size: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`)
}

main()
