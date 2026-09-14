#!/usr/bin/env node

/**
 * Documentation PDF Generator with Bookmarks
 * Generates a single PDF from markdown documentation with TOC and bookmarks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs');
const outputDir = path.join(projectRoot, 'dist-docs');

// Document structure with file order and bookmark hierarchy
const documentStructure = [
  {
    title: 'TI-89 68000 Emulator Documentation',
    file: 'TITLE.md',
    level: 0,
  },
  {
    title: '1. Getting Started',
    file: 'GETTING_STARTED.md',
    level: 0,
  },
  {
    title: '2. Architecture',
    file: 'ARCHITECTURE.md',
    level: 0,
  },
  {
    title: '3. Opcode Reference',
    file: 'OPCODES.md',
    level: 0,
  },
  {
    title: '4. API Documentation',
    file: 'API.md',
    level: 0,
  },
  {
    title: '5. Memory Layout',
    file: 'MEMORY.md',
    level: 0,
  },
  {
    title: '6. Examples',
    file: 'EXAMPLES.md',
    level: 0,
  },
  {
    title: '7. Installation & Distribution',
    file: 'INSTALLATION.md',
    level: 0,
  },
  {
    title: '8. Troubleshooting',
    file: 'TROUBLESHOOTING.md',
    level: 0,
  },
];

/**
 * Convert markdown to simple formatted text with HTML entities
 */
function markdownToText(markdown) {
  let text = markdown;

  // Remove markdown links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // Convert bold **text** -> BOLD text
  text = text.replace(/\*\*([^\*]+)\*\*/g, '$1');

  // Convert italic *text* -> text
  text = text.replace(/\*([^\*]+)\*/g, '$1');

  // Convert headers # -> remove, but keep line breaks
  text = text.replace(/^#+\s+/gm, '');

  // Remove code fences
  text = text.replace(/```[\s\S]*?```/g, '');

  // Clean up extra whitespace
  text = text.replace(/\n\n\n+/g, '\n\n');

  return text.trim();
}

/**
 * Generate PDF using a simpler approach with comments
 * (Since we can't easily add bookmarks in Node without heavy dependencies)
 */
function generatePlainTextWithStructure() {
  let fullText = 'TI-89 68000 EMULATOR - COMPLETE DOCUMENTATION\n';
  fullText += '='.repeat(50) + '\n\n';
  fullText += `Generated: ${new Date().toISOString()}\n\n`;

  // Table of Contents
  fullText += 'TABLE OF CONTENTS\n';
  fullText += '-'.repeat(50) + '\n\n';

  documentStructure.forEach((doc, index) => {
    const indent = '  '.repeat(doc.level);
    fullText += `${indent}${doc.title}\n`;
  });

  fullText += '\n' + '='.repeat(50) + '\n\n';

  // Content
  documentStructure.forEach((doc) => {
    const filePath = path.join(docsDir, doc.file);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      fullText += `\n${'='.repeat(50)}\n`;
      fullText += `${doc.title}\n`;
      fullText += `${'='.repeat(50)}\n\n`;
      fullText += markdownToText(content);
      fullText += '\n\n';
    } else {
      console.warn(`⚠️  File not found: ${filePath}`);
    }
  });

  return fullText;
}

/**
 * Main function
 */
async function main() {
  console.log('📚 Generating documentation...\n');

  try {
    // Create output directory if needed
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // For now, generate the combined markdown
    console.log('📄 Combining markdown files...');

    let combinedMarkdown = '# TI-89 68000 Emulator - Documentation\n\n';
    combinedMarkdown +=
      `*Generated: ${new Date().toISOString()}*\n\n`;
    combinedMarkdown += '## Table of Contents\n\n';

    // Generate TOC
    documentStructure.forEach((doc, index) => {
      const indent = '  '.repeat(doc.level);
      combinedMarkdown += `${indent}- [${doc.title}](#section-${index})\n`;
    });

    combinedMarkdown += '\n---\n\n';

    // Add content
    documentStructure.forEach((doc, index) => {
      const filePath = path.join(docsDir, doc.file);

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        combinedMarkdown += `<a id="section-${index}"></a>\n\n`;
        combinedMarkdown += `# ${doc.title}\n\n`;
        combinedMarkdown += content;
        combinedMarkdown += '\n\n---\n\n';
      }
    });

    // Save combined markdown
    const mdOutputPath = path.join(outputDir, 'documentation.md');
    fs.writeFileSync(mdOutputPath, combinedMarkdown);
    console.log(`✅ Markdown saved: ${mdOutputPath}`);

    // Info about PDF generation
    console.log('\n📌 To generate PDF with bookmarks, use one of these tools:\n');
    console.log('  Option 1 - Using pandoc (recommended):');
    console.log('  npm install -g pandoc');
    console.log(`  pandoc ${mdOutputPath} -o ${outputDir}/documentation.pdf --toc --toc-depth=2\n`);

    console.log('  Option 2 - Using wkhtmltopdf:');
    console.log('  npm install -D wkhtmltopdf');
    console.log(`  wkhtmltopdf ${mdOutputPath} ${outputDir}/documentation.pdf\n`);

    console.log('  Option 3 - Browser-based (Chrome headless):');
    console.log('  npm install -D puppeteer');
    console.log('  (Running: npx node scripts/generate-pdf-puppeteer.js)\n');

    console.log('💡 Next step: Install one of these and run the PDF generation');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
