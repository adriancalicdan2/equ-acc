import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Replicate FIXED injectPlaceholdersIntoXml
function injectPlaceholdersIntoXml(xml) {
  let result = xml;

  result = result.replace(/(<w:p[^>]*w14:paraId="22EEEEC4"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{vesselName}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="5DC70186"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{installationDate}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="38BEF448"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{leadEngineer}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="3625934D"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="5A90C26B"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceTank}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="7E7F6DB7"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceSN}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="79A1066E"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{flsCapacitanceStatus}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="5F4E7F5A"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="617880BA"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterTank}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="66EF4206"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterSN}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="03C4D3F3"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{flsFloaterStatus}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="6F5761A3"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{networkQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="0649AFD1"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{networkSN}</w:t></w:r>$3');
  // FIXED: consume entire multi-para block
  result = result.replace(
    /(<w:p[^>]*w14:paraId="53EA934E"[^>]*>)[\s\S]*?<w:p[^>]*w14:paraId="58AF202E"[^>]*>[\s\S]*?<\/w:p>/,
    '$1<w:r><w:t>{networkSignalStatus}</w:t></w:r></w:p>'
  );
  result = result.replace(/(<w:p[^>]*w14:paraId="4A5E85ED"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="2744ACB1"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineConnected}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="10A1C2BE"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineSN}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="19CFD271"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="54C8F9B7"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarLocation}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="3D20B1F4"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarSN}</w:t></w:r>$3');
  // FIXED: consume entire multi-para block
  result = result.replace(
    /(<w:p[^>]*w14:paraId="2A57BAA1"[^>]*>)[\s\S]*?<w:p[^>]*w14:paraId="3A7BCADB"[^>]*>[\s\S]*?<\/w:p>/,
    '$1<w:r><w:t>{solarPowerStatus}</w:t></w:r></w:p>'
  );
  result = result.replace(/(<w:p[^>]*w14:paraId="045A59BF"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{remarks}</w:t></w:r>$3');
  result = result.replace(/<w:p[^>]*w14:paraId="19319535"[^>]*>[\s\S]*?<\/w:p>/, '');
  result = result.replace(/<w:p[^>]*w14:paraId="32E306A3"[^>]*>[\s\S]*?<\/w:p>/, '');

  return result;
}

const templatePath = path.join(projectRoot, 'public', 'templates', 'EQUIPMENT ACCOUNTABILITY - AIMF.docx');
const content = fs.readFileSync(templatePath);
const zip = new PizZip(content);
const origXml = zip.files['word/document.xml'].asText();
const injXml = injectPlaceholdersIntoXml(origXml);

const origOpen = (origXml.match(/<w:p[ >]/g) || []).length;
const origClose = (origXml.match(/<\/w:p>/g) || []).length;
const injOpen = (injXml.match(/<w:p[ >]/g) || []).length;
const injClose = (injXml.match(/<\/w:p>/g) || []).length;

console.log(`Original: ${origOpen} open, ${origClose} close → ${origOpen === origClose ? 'balanced' : 'UNBALANCED'}`);
console.log(`Injected: ${injOpen} open, ${injClose} close → ${injOpen === injClose ? 'balanced' : 'UNBALANCED (diff=' + (injOpen - injClose) + ')'}`);

// Find where the original XML is unbalanced
console.log('\n--- Finding unbalanced paragraphs in ORIGINAL template XML ---');
const lines = origXml.split('\n');
let depth = 0;
let unbalancedPositions = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<w:p[ >]/g) || []).length;
  const closes = (line.match(/<\/w:p>/g) || []).length;
  if (opens !== closes) {
    depth += opens - closes;
    unbalancedPositions.push({ line: i+1, opens, closes, depth, content: line.trim().substring(0, 100) });
  }
}
if (unbalancedPositions.length === 0) {
  console.log('  Original XML is paragraph-balanced across all lines.');
  console.log('  (Imbalance may be within single lines with multiple open/close)');
  
  // Do a single-pass char-by-char analysis
  let pos = 0;
  let pDepth = 0;
  let maxDepth = 0;
  const depthMap = [];
  const openRe = /<w:p[ >]/g;
  const closeRe = /<\/w:p>/g;
  
  // Count occurrences by scanning sequentially
  const allTags = [...origXml.matchAll(/<w:p[ >]|<\/w:p>/g)];
  for (const match of allTags) {
    if (match[0].startsWith('<w:p')) {
      pDepth++;
      if (pDepth > maxDepth) maxDepth = pDepth;
    } else {
      pDepth--;
    }
    if (pDepth < 0) {
      console.log(`  Paragraph closed before opened at pos ${match.index}: "${origXml.substring(match.index - 100, match.index + 50)}"`);
    }
  }
  console.log(`  Final depth: ${pDepth} (should be 0), max depth: ${maxDepth}`);
} else {
  unbalancedPositions.forEach(u => console.log(u));
}

// Now dump the original XML to a file so we can inspect it manually
fs.writeFileSync(path.join(projectRoot, 'scripts', 'original-aimf-document.xml'), origXml);
fs.writeFileSync(path.join(projectRoot, 'scripts', 'injected-aimf-document.xml'), injXml);
console.log('\nDumped XMLs to scripts/original-aimf-document.xml and scripts/injected-aimf-document.xml');
