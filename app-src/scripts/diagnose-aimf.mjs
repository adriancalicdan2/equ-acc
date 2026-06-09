import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const templatePath = path.join(projectRoot, 'public', 'templates', 'EQUIPMENT ACCOUNTABILITY - AIMF.docx');
console.log('Template path:', templatePath);
console.log('Exists:', fs.existsSync(templatePath));

try {
  const content = fs.readFileSync(templatePath);
  console.log('Template size:', content.length, 'bytes');
  const zip = new PizZip(content);
  console.log('Zip files:', Object.keys(zip.files).slice(0, 15).join(', '));

  const docXml = zip.files['word/document.xml'].asText();
  console.log('document.xml length:', docXml.length);

  // Check for paraIds used in injectPlaceholdersIntoXml
  const paraIds = [
    ['22EEEEC4', 'vesselName'],
    ['5DC70186', 'installationDate'],
    ['38BEF448', 'leadEngineer'],
    ['3625934D', 'flsCapacitanceQty'],
    ['5A90C26B', 'flsCapacitanceTank'],
    ['7E7F6DB7', 'flsCapacitanceSN'],
    ['79A1066E', 'flsCapacitanceStatus'],
    ['5F4E7F5A', 'flsFloaterQty'],
    ['617880BA', 'flsFloaterTank'],
    ['66EF4206', 'flsFloaterSN'],
    ['03C4D3F3', 'flsFloaterStatus'],
    ['6F5761A3', 'networkQty'],
    ['0649AFD1', 'networkSN'],
    ['53EA934E', 'networkSignalStatus-start'],
    ['58AF202E', 'networkSignalStatus-end'],
    ['4A5E85ED', 'engineQty'],
    ['2744ACB1', 'engineConnected'],
    ['10A1C2BE', 'engineSN'],
    ['19CFD271', 'solarQty'],
    ['54C8F9B7', 'solarLocation'],
    ['3D20B1F4', 'solarSN'],
    ['2A57BAA1', 'solarPowerStatus-start'],
    ['3A7BCADB', 'solarPowerStatus-end'],
    ['045A59BF', 'remarks'],
    ['7A76036B', 'fls-photo-anchor'],
    ['1B81CB9C', 'network-photo-anchor'],
    ['500EC034', 'engine-photo-anchor'],
    ['1A9ADCE2', 'solar-photo-anchor'],
  ];

  console.log('\n--- Para ID presence in document.xml ---');
  let allFound = true;
  for (const [id, label] of paraIds) {
    const found = docXml.includes(id);
    if (!found) allFound = false;
    console.log(`  ${found ? '✓' : '✗'} ${id} (${label})`);
  }

  console.log('\n--- Docxtemplater dry-run (no images) ---');
  const testZip = new PizZip(content);
  const doc = new Docxtemplater(testZip, { paragraphLoop: true, linebreaks: true });
  try {
    doc.render({
      vesselName: 'TEST', installationDate: 'Jan 1 2025', leadEngineer: 'Eng',
      flsCapacitanceQty: '1', flsCapacitanceTank: 'T1', flsCapacitanceSN: 'SN1', flsCapacitanceStatus: '✔ Good',
      flsFloaterQty: '1', flsFloaterTank: 'T1', flsFloaterSN: 'SN2', flsFloaterStatus: '✔ Good',
      networkQty: '1', networkSN: 'SN3', networkSignalStatus: '✔ Excellent',
      engineQty: '1', engineConnected: 'E1', engineSN: 'SN4',
      solarQty: '1', solarLocation: 'Roof', solarSN: 'SN5', solarPowerStatus: '✔ Charged',
      remarks: 'Done', techName: 'Tech', techDesignation: 'Engr', signoffDate: 'Jun 1 2025',
      receiverName: 'Recv', receiverDesignation: 'Capt', copyLabel: 'AIMF Copy',
    });
    const out = doc.getZip().generate({ type: 'nodebuffer' });
    fs.writeFileSync(path.join(projectRoot, 'scripts', 'test-output-aimf.docx'), out);
    console.log('  ✓ Docxtemplater render succeeded! Output: scripts/test-output-aimf.docx');
  } catch (e) {
    console.error('  ✗ Docxtemplater render failed:', e.message);
    if (e.properties?.errors) {
      console.error('  Errors:', JSON.stringify(e.properties.errors, null, 2));
    }
  }

} catch (e) {
  console.error('Fatal Error:', e.message);
}
