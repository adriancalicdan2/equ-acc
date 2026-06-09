/**
 * Full end-to-end test that mirrors the EXACT API route behavior including ImageModule.
 * Run: node --experimental-vm-modules scripts/test-full-api.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// --- Replicate generateDocx.ts helpers ---

function nullImageBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );
}

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

function buildPhotoTableXml(photos, prefix) {
  if (photos.length === 0) return '';
  const cells = photos.slice(0, 3).map((_, i) =>
    `<w:tc><w:tcPr><w:tcW w:w="3518" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr></w:rPr><w:t>{%${prefix}Photo${i + 1}}</w:t></w:r></w:p></w:tc>`
  ).join('');
  const emptyCell = '<w:tc><w:tcPr><w:tcW w:w="3518" w:type="dxa"/></w:tcPr><w:p/></w:tc>';
  const padding = Array(3 - photos.length).fill(emptyCell).join('');
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>` +
    `<w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblLook w:val="04A0"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="3518"/><w:gridCol w:w="3518"/><w:gridCol w:w="3518"/></w:tblGrid>` +
    `<w:tr>${cells}${padding}</w:tr></w:tbl>`
  );
}

function injectPhotoTablesIntoXml(xml, flsPhotos, networkPhotos, enginePhotos, solarPhotos) {
  let result = xml;
  const flsTbl = buildPhotoTableXml(flsPhotos, 'fls');
  const networkTbl = buildPhotoTableXml(networkPhotos, 'network');
  const engineTbl = buildPhotoTableXml(enginePhotos, 'engine');
  const solarTbl = buildPhotoTableXml(solarPhotos, 'solar');
  if (flsTbl) result = result.replace(/(<w:p[^>]*w14:paraId="7A76036B"[^>]*>)/, `${flsTbl}$1`);
  if (networkTbl) result = result.replace(/(<w:p[^>]*w14:paraId="1B81CB9C"[^>]*>)/, `${networkTbl}$1`);
  if (engineTbl) result = result.replace(/(<w:p[^>]*w14:paraId="500EC034"[^>]*>)/, `${engineTbl}$1`);
  if (solarTbl) result = result.replace(/(<w:p[^>]*w14:paraId="1A9ADCE2"[^>]*>)/, `${solarTbl}$1`);
  return result;
}

// --- Test with dummy photos (simulating 1 photo per section) ---
async function testGeneration() {
  const templatePath = path.join(projectRoot, 'public', 'templates', 'EQUIPMENT ACCOUNTABILITY - AIMF.docx');
  const templateContent = fs.readFileSync(templatePath);
  const zip = new PizZip(templateContent);

  // Simulate no photos (same as what happens when user doesn't upload)
  const flsImgs = [];
  const networkImgs = [];
  const engineImgs = [];
  const solarImgs = [];

  const imageMap = {};
  const sizeMap = {};

  const registerPhotos = (imgs, prefix) => {
    for (let i = 0; i < 3; i++) {
      const key = `${prefix}Photo${i + 1}`;
      if (imgs[i]) {
        imageMap[key] = imgs[i].data;
        sizeMap[key] = [imgs[i].width, imgs[i].height];
      } else {
        imageMap[key] = nullImageBuffer();
        sizeMap[key] = [1, 1];
      }
    }
  };

  registerPhotos(flsImgs, 'fls');
  registerPhotos(networkImgs, 'network');
  registerPhotos(engineImgs, 'engine');
  registerPhotos(solarImgs, 'solar');

  let docXml = zip.files['word/document.xml'].asText();
  docXml = injectPlaceholdersIntoXml(docXml);
  // No photos so no photo tables injected
  docXml = injectPhotoTablesIntoXml(docXml, flsImgs, networkImgs, engineImgs, solarImgs);
  zip.file('word/document.xml', docXml);

  console.log('Creating ImageModule...');
  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage(tag) { return imageMap[tag] ?? nullImageBuffer(); },
    getSize(tag) { return sizeMap[tag] ?? [1, 1]; },
  });

  console.log('Creating Docxtemplater...');
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });

  const renderData = {
    vesselName: 'MV TEST VESSEL', installationDate: 'June 1, 2025', leadEngineer: 'John Doe',
    flsCapacitanceQty: '2', flsCapacitanceTank: 'T1, T2', flsCapacitanceSN: 'CAP-001, CAP-002',
    flsCapacitanceStatus: '✔ Good Working Condition',
    flsFloaterQty: '2', flsFloaterTank: 'T1, T2', flsFloaterSN: 'FLT-001, FLT-002',
    flsFloaterStatus: '✔ Good Working Condition',
    networkQty: '1', networkSN: 'NET-001', networkSignalStatus: '✔ Excellent',
    engineQty: '1', engineConnected: 'Main Engine', engineSN: 'ENG-001',
    solarQty: '1', solarLocation: 'Rooftop', solarSN: 'SOL-001',
    solarPowerStatus: '✔ Fully Charged',
    remarks: 'Installation done properly.',
    techName: 'John Engineer', techDesignation: 'Marine Engineer',
    signoffDate: 'June 9, 2025', receiverName: 'Captain Smith',
    receiverDesignation: 'Ship Captain', copyLabel: 'AIMF Copy',
  };

  console.log('Rendering document...');
  try {
    doc.render(renderData);
    console.log('✓ Render successful!');
  } catch (e) {
    console.error('✗ Render FAILED:', e.message);
    if (e.properties?.errors) {
      for (const err of e.properties.errors) {
        console.error('  Error:', JSON.stringify(err));
      }
    }
    process.exit(1);
  }

  const docxBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  
  // Validate magic bytes
  const magic = docxBuffer.slice(0, 4).toString('hex');
  console.log(`\nDocx output: ${docxBuffer.length} bytes, magic=${magic} (${magic === '504b0304' ? 'valid ZIP ✓' : 'INVALID ✗'})`);

  // Now simulate the JSZip wrapper (the route.ts layer)
  console.log('\nWrapping in JSZip (simulating route.ts)...');
  const jszip = new JSZip();
  jszip.file('Equipment-Accountability-AIMF-Copy.docx', docxBuffer, { compression: 'STORE' });
  const zipBuffer = await jszip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  
  const zipMagic = zipBuffer.slice(0, 4).toString('hex');
  console.log(`Zip output: ${zipBuffer.length} bytes, magic=${zipMagic} (${zipMagic === '504b0304' ? 'valid ZIP ✓' : 'INVALID ✗'})`);

  // Save the outer zip for manual inspection
  const outZip = path.join(projectRoot, 'scripts', 'test-output.zip');
  fs.writeFileSync(outZip, zipBuffer);
  console.log(`\n✓ Test zip saved to: ${outZip}`);
  console.log('  Extract it and try opening the AIMF docx in Word.');

  // Also check the content type header would be correct
  console.log('\n--- Simulated Response Headers ---');
  console.log('Content-Type: application/zip');
  console.log(`Content-Length: ${zipBuffer.length}`);
  console.log('Content-Disposition: attachment; filename="Equipment-Accountability-Report.zip"');

  // Check the inner docx inside the zip
  const innerZip = await JSZip.loadAsync(zipBuffer);
  const innerDocx = await innerZip.file('Equipment-Accountability-AIMF-Copy.docx')?.async('nodebuffer');
  if (innerDocx) {
    const innerMagic = innerDocx.slice(0, 4).toString('hex');
    console.log(`\nInner AIMF docx: ${innerDocx.length} bytes, magic=${innerMagic} (${innerMagic === '504b0304' ? 'valid ✓' : 'CORRUPTED ✗'})`);
    fs.writeFileSync(path.join(projectRoot, 'scripts', 'extracted-aimf.docx'), innerDocx);
    console.log('Saved extracted AIMF docx to scripts/extracted-aimf.docx - try opening this directly in Word!');
  }
}

testGeneration().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
