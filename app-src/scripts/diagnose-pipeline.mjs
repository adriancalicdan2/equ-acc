import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Replicate the exact injectPlaceholdersIntoXml function from generateDocx.ts
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
  result = result.replace(
    /(<w:p[^>]*w14:paraId="2A57BAA1"[^>]*>)[\s\S]*?<w:p[^>]*w14:paraId="3A7BCADB"[^>]*>[\s\S]*?<\/w:p>/,
    '$1<w:r><w:t>{solarPowerStatus}</w:t></w:r></w:p>'
  );

  result = result.replace(/(<w:p[^>]*w14:paraId="045A59BF"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{remarks}</w:t></w:r>$3');
  result = result.replace(/<w:p[^>]*w14:paraId="19319535"[^>]*>[\s\S]*?<\/w:p>/, '');
  result = result.replace(/<w:p[^>]*w14:paraId="32E306A3"[^>]*>[\s\S]*?<\/w:p>/, '');

  return result;
}

// Run full pipeline on AIMF and check if resulting XML is valid
const templatePath = path.join(projectRoot, 'public', 'templates', 'EQUIPMENT ACCOUNTABILITY - AIMF.docx');
const content = fs.readFileSync(templatePath);
const zip = new PizZip(content);
let docXml = zip.files['word/document.xml'].asText();

const originalLength = docXml.length;
console.log('Original XML length:', originalLength);

docXml = injectPlaceholdersIntoXml(docXml);
console.log('After injection XML length:', docXml.length);
console.log('Difference:', docXml.length - originalLength, 'chars');

// Check if the XML still has proper structure  
const openParaCount = (docXml.match(/<w:p[ >]/g) || []).length;
const closeParaCount = (docXml.match(/<\/w:p>/g) || []).length;
console.log('\nParagraph tags:');
console.log('  Open  <w:p>:', openParaCount);
console.log('  Close </w:p>:', closeParaCount);
console.log('  Balanced:', openParaCount === closeParaCount ? 'YES ✓' : 'NO ✗ — XML IS MALFORMED!');

const openTrCount = (docXml.match(/<w:tr[ >]/g) || []).length;
const closeTrCount = (docXml.match(/<\/w:tr>/g) || []).length;
console.log('\nTable row tags:');
console.log('  Open  <w:tr>:', openTrCount);
console.log('  Close </w:tr>:', closeTrCount);
console.log('  Balanced:', openTrCount === closeTrCount ? 'YES ✓' : 'NO ✗ — XML IS MALFORMED!');

const openTbCount = (docXml.match(/<w:tbl>/g) || []).length;
const closeTbCount = (docXml.match(/<\/w:tbl>/g) || []).length;
console.log('\nTable tags:');
console.log('  Open  <w:tbl>:', openTbCount);
console.log('  Close </w:tbl>:', closeTbCount);
console.log('  Balanced:', openTbCount === closeTbCount ? 'YES ✓' : 'NO ✗ — XML IS MALFORMED!');

// Now write the injected XML back and try to open with docxtemplater
zip.file('word/document.xml', docXml);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
try {
  doc.render({
    vesselName: 'TEST VESSEL', installationDate: 'Jan 1 2025', leadEngineer: 'John Doe',
    flsCapacitanceQty: '2', flsCapacitanceTank: 'T1, T2', flsCapacitanceSN: 'SN1, SN2', flsCapacitanceStatus: '✔ Good Working Condition',
    flsFloaterQty: '2', flsFloaterTank: 'T1, T2', flsFloaterSN: 'SN3, SN4', flsFloaterStatus: '✔ Good Working Condition',
    networkQty: '1', networkSN: 'SN5', networkSignalStatus: '✔ Excellent',
    engineQty: '1', engineConnected: 'E1', engineSN: 'SN6',
    solarQty: '1', solarLocation: 'Rooftop', solarSN: 'SN7', solarPowerStatus: '✔ Fully Charged',
    remarks: 'Installation done properly',
    techName: 'Tech Name', techDesignation: 'Engineer', signoffDate: 'Jun 1 2025',
    receiverName: 'Receiver', receiverDesignation: 'Captain',
    copyLabel: 'AIMF Copy',
  });
  const outBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const outPath = path.join(projectRoot, 'scripts', 'full-pipeline-aimf.docx');
  fs.writeFileSync(outPath, outBuffer);
  console.log('\n✓ Full pipeline AIMF output saved to:', outPath);
  console.log('  Output size:', outBuffer.length, 'bytes');
} catch (e) {
  console.error('\n✗ Full pipeline FAILED:', e.message);
  if (e.properties?.errors) {
    console.error('Docxtemplater errors:', JSON.stringify(e.properties.errors, null, 2));
  }
}
