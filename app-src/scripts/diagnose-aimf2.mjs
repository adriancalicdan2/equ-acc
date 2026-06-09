import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Check all three templates for the remarks paraId and deletion paraIds
const templates = [
  ['AIMF', 'EQUIPMENT ACCOUNTABILITY - AIMF.docx'],
  ['Vessel', 'EQUIPMENT ACCOUNTABILITY - Vessel.docx'],
  ['Vessel Owner', 'EQUIPMENT ACCOUNTABILITY - Vessel Owner.docx'],
];

for (const [name, filename] of templates) {
  const tplPath = path.join(projectRoot, 'public', 'templates', filename);
  const content = fs.readFileSync(tplPath);
  const zip = new PizZip(content);
  const xml = zip.files['word/document.xml'].asText();

  console.log(`\n=== ${name} ===`);
  console.log('  remarks paraId 045A59BF:', xml.includes('045A59BF') ? 'FOUND' : '*** MISSING ***');
  console.log('  delete para 19319535:', xml.includes('19319535') ? 'FOUND (will be deleted)' : 'not found');
  console.log('  delete para 32E306A3:', xml.includes('32E306A3') ? 'FOUND (will be deleted)' : 'not found');

  // Also check for any {template} placeholders remaining in document after xml injection
  // Look at what text is actually in the remarks area - search nearby
  const remarksIdx = xml.indexOf('045A59BF');
  if (remarksIdx !== -1) {
    const snippet = xml.substring(remarksIdx - 50, remarksIdx + 200);
    console.log('  Remarks area snippet:', snippet.replace(/[\r\n]/g, ' ').substring(0, 300));
  } else {
    // search for the word "Remarks" in xml
    const remarksTextIdx = xml.toLowerCase().indexOf('remarks');
    if (remarksTextIdx !== -1) {
      const ctx = xml.substring(remarksTextIdx - 200, remarksTextIdx + 400);
      const paraIds = ctx.match(/paraId="([^"]+)"/g);
      console.log('  "Remarks" text found near paraIds:', paraIds?.join(', ') || 'none');
      console.log('  Context:', ctx.replace(/[\r\n]/g, ' ').substring(0, 400));
    }
  }
}

// Also check what the network signal multi-para replacement looks like
const aimfPath = path.join(projectRoot, 'public', 'templates', 'EQUIPMENT ACCOUNTABILITY - AIMF.docx');
const aimfContent = fs.readFileSync(aimfPath);
const aimfZip = new PizZip(aimfContent);
const aimfXml = aimfZip.files['word/document.xml'].asText();

console.log('\n\n=== Checking signal status regex match ===');
const sigStart = aimfXml.indexOf('53EA934E');
const sigEnd = aimfXml.indexOf('58AF202E');
if (sigStart !== -1 && sigEnd !== -1) {
  const between = aimfXml.substring(sigStart, sigEnd + 100);
  console.log('Signal para distance:', sigEnd - sigStart, 'chars');
  console.log('Signal snippet:', between.replace(/[\r\n]/g, ' ').substring(0, 500));
}

console.log('\n=== Checking solar power status regex match ===');
const solStart = aimfXml.indexOf('2A57BAA1');
const solEnd = aimfXml.indexOf('3A7BCADB');
if (solStart !== -1 && solEnd !== -1) {
  const between = aimfXml.substring(solStart, solEnd + 100);
  console.log('Solar para distance:', solEnd - solStart, 'chars');
  console.log('Solar snippet:', between.replace(/[\r\n]/g, ' ').substring(0, 500));
}
