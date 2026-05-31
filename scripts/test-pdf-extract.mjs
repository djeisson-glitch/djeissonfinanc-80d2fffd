#!/usr/bin/env node
// Quick test: extrai texto de UM PDF via pdfjs-dist em Node.
// Uso: node scripts/test-pdf-extract.mjs /path/to/file.pdf
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const file = process.argv[2];
if (!file) {
  console.error('Uso: node test-pdf-extract.mjs <arquivo.pdf>');
  process.exit(1);
}

const data = new Uint8Array(readFileSync(file));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
console.log(`📄 ${file} — ${doc.numPages} páginas`);

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const text = content.items.map((it) => it.str).join(' ');
  console.log(`\n--- PÁGINA ${i} (${content.items.length} items) ---`);
  console.log(text.slice(0, 600));
  if (text.length > 600) console.log(`... [+${text.length - 600} chars]`);
}
