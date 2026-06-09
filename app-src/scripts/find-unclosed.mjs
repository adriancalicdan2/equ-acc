import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const origXml = fs.readFileSync(path.join(projectRoot, 'scripts', 'original-aimf-document.xml'), 'utf8');
const injXml = fs.readFileSync(path.join(projectRoot, 'scripts', 'injected-aimf-document.xml'), 'utf8');

function analyzeBalance(xml, label) {
  const stack = [];
  const allTags = [...xml.matchAll(/(<w:p[ >])|(<\/w:p>)/g)];
  
  for (const m of allTags) {
    if (m[1]) { // opening tag
      const pos = m.index;
      const snippet = xml.substring(pos, pos + 120);
      const pid = snippet.match(/paraId="([^"]+)"/)?.[1] ?? 'NO_ID';
      stack.push({ pos, pid });
    } else { // closing tag
      if (stack.length > 0) {
        stack.pop();
      } else {
        console.log(`  [${label}] Unmatched </w:p> at pos ${m.index}`);
      }
    }
  }

  console.log(`[${label}] Unclosed <w:p> count: ${stack.length}`);
  for (const { pos, pid } of stack) {
    const ctx = xml.substring(pos, pos + 200).replace(/[\r\n]/g, ' ');
    console.log(`  paraId=${pid}, pos=${pos}`);
    console.log(`  ctx: ${ctx.substring(0, 150)}`);
  }
  return stack;
}

console.log('=== ORIGINAL AIMF template ===');
const origUnclosed = analyzeBalance(origXml, 'ORIGINAL');

console.log('\n=== INJECTED AIMF (after XML manipulation) ===');
const injUnclosed = analyzeBalance(injXml, 'INJECTED');

// Find paraIds in injected but not original (new unclosed ones introduced by injection)
const origIds = new Set(origUnclosed.map(u => u.pid));
const injIds = new Set(injUnclosed.map(u => u.pid));
console.log('\n=== NEW unclosed paragraphs introduced by injection ===');
const newUnclosed = [...injUnclosed].filter(u => !origIds.has(u.pid));
if (newUnclosed.length === 0) {
  console.log('  None! All unclosed paragraphs existed in the original template.');
  console.log('  The template itself has nested <w:p> (e.g. inside SDTs or bookmarks) which is valid in OOXML.');
} else {
  for (const { pid, pos } of newUnclosed) {
    console.log(`  paraId=${pid} at pos=${pos}`);
  }
}

// Removed by injection (closed properly now)
const removedByInj = [...origUnclosed].filter(u => !injIds.has(u.pid));
console.log('\n=== Paragraphs that were unclosed in original but closed after injection ===');
if (removedByInj.length === 0) {
  console.log('  None');
} else {
  for (const { pid } of removedByInj) {
    console.log(`  paraId=${pid}`);
  }
}
