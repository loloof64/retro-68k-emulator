#!/usr/bin/env node

/**
 * PDF Generator using Puppeteer (Chrome headless)
 * Generates PDF with bookmarks from HTML
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateHtmlDocument } from './lib/docs-html.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const docsDir = path.join(projectRoot, 'docs')
const outputDir = path.join(projectRoot, 'dist')

/**
 * Main function - requires Puppeteer to be installed
 */
async function main() {
  console.log('📄 Generating PDF with Puppeteer...\n')

  try {
    // Check if Puppeteer is available
    let puppeteer
    try {
      puppeteer = (await import('puppeteer')).default
    } catch (e) {
      console.log('❌ Puppeteer not found. Install with:')
      console.log('   npm install -D puppeteer\n')
      console.log('Or use an alternative method:')
      console.log('   npm run docs:pdf:weasyprint\n')
      process.exit(1)
    }

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Generate HTML
    console.log('📝 Generating HTML...')
    const html = generateHtmlDocument({ docsDir })

    // Save temporary HTML
    const tempHtmlPath = path.join(outputDir, 'temp-doc.html')
    fs.writeFileSync(tempHtmlPath, html)

    // Launch browser and generate PDF
    console.log('🌐 Launching headless browser...')
    const browser = await puppeteer.launch()
    const page = await browser.newPage()

    console.log('📄 Rendering to PDF...')
    await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' })

    const pdfPath = path.join(outputDir, 'TI89-68000-Documentation.pdf')
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
    })

    await browser.close()

    // Clean up temp file
    fs.unlinkSync(tempHtmlPath)

    console.log(`\n✅ PDF generated successfully!`)
    console.log(`📍 Location: ${pdfPath}`)
    console.log(`📊 File size: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()
