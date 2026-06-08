/**
 * One-time script: Injects docxtemplater {placeholder} tags into the 3 AIMF DOCX templates.
 * Run with: npx ts-node --project tsconfig.node.json scripts/inject-placeholders.ts
 *
 * Strategy: Reads each source DOCX as a ZIP, modifies document.xml to replace blank
 * data cells and static values with {tag} placeholders, writes to /templates/*.docx
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const WORKSPACE = path.join(__dirname, '..');
const SOURCE_DIR = path.join(WORKSPACE, '..'); // parent dir has the original DOCX files
const TEMPLATES_DIR = path.join(WORKSPACE, 'public', 'templates');

if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

const configs = [
  {
    sourceFile: 'EQUIPMENT ACCOUNTABILITY - AIMF.docx',
    outputFile: 'AIMF-template.docx',
    copyLabel: 'AIMF Copy',
  },
  {
    sourceFile: 'EQUIPMENT ACCOUNTABILITY - Vessel.docx',
    outputFile: 'Vessel-template.docx',
    copyLabel: 'Vessel Copy',
  },
  {
    sourceFile: 'EQUIPMENT ACCOUNTABILITY - Vessel Owner.docx',
    outputFile: 'VesselOwner-template.docx',
    copyLabel: 'Vessel Owner Copy',
  },
];

function injectPlaceholders(xml) {
  let result = xml;

  // ─── TABLE 1: Vessel Info ───────────────────────────────────────────────────
  // Row 1 – Vessel Name value cell (paraId 22EEEEC4) — replace entire paragraph content
  result = result.replace(
    /(<w:tc>[\s\S]*?<w:p[^>]*w14:paraId="22EEEEC4"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>{vesselName}</w:t></w:r>$3'
  );

  // Row 2 – Installation Date value cell (paraId 5DC70186)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="5DC70186"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>{installationDate}</w:t></w:r>$3'
  );

  // Row 3 – Lead Engineer value cell (paraId 38BEF448)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="38BEF448"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>{leadEngineer}</w:t></w:r>$3'
  );

  // ─── TABLE 2: FLS – Capacitance row ────────────────────────────────────────
  // Qty (paraId 3625934D)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="3625934D"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceQty}</w:t></w:r>$3'
  );
  // Tank Assigned (paraId 5A90C26B)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="5A90C26B"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceTank}</w:t></w:r>$3'
  );
  // S/N (paraId 7E7F6DB7)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="7E7F6DB7"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceSN}</w:t></w:r>$3'
  );
  // Calibration Status (paraId 79A1066E) — replace checkbox text
  result = result.replace(
    /(<w:p[^>]*w14:paraId="79A1066E"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>{flsCapacitanceStatus}</w:t></w:r>$3'
  );

  // ─── TABLE 2: FLS – Floater row ────────────────────────────────────────────
  // Qty (paraId 5F4E7F5A)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="5F4E7F5A"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterQty}</w:t></w:r>$3'
  );
  // Tank (paraId 617880BA)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="617880BA"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterTank}</w:t></w:r>$3'
  );
  // S/N (paraId 66EF4206)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="66EF4206"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterSN}</w:t></w:r>$3'
  );
  // Status (paraId 03C4D3F3)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="03C4D3F3"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>{flsFloaterStatus}</w:t></w:r>$3'
  );

  // ─── FLS Photo placeholder row (inject after FLS table) ────────────────────
  // We inject a new paragraph after the FLS table with image placeholders
  result = result.replace(
    /(<\/w:tbl>)(<w:p[^>]*w14:paraId="7A76036B")/,
    '$1' +
    '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="3518"/><w:gridCol w:w="3518"/><w:gridCol w:w="3518"/></w:tblGrid>' +
    '<w:tr><w:tc><w:p><w:r><w:drawing><wp:inline><wp:extent cx="3810000" cy="2857500"/><wp:docPr id="101" name="flsPhoto1"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="101" name="flsPhoto1"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId_fls1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3810000" cy="2857500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p w14:paraId="7A76036B"'
  );

  // ─── TABLE 3: Network ───────────────────────────────────────────────────────
  // Qty (paraId 6F5761A3)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="6F5761A3"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{networkQty}</w:t></w:r>$3'
  );
  // S/N (paraId 0649AFD1)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="0649AFD1"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{networkSN}</w:t></w:r>$3'
  );
  // Signal status block (paraId 53EA934E) — replace the entire signal options block
  result = result.replace(
    /(<w:p[^>]*w14:paraId="53EA934E"[^>]*>)([\s\S]*?)(<w:p[^>]*w14:paraId="58AF202E"[^>]*>[\s\S]*?<\/w:p>)/,
    '$1<w:r><w:t>{networkSignalStatus}</w:t></w:r></w:p>'
  );

  // ─── TABLE 4: Engine ────────────────────────────────────────────────────────
  // Qty (paraId 4A5E85ED)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="4A5E85ED"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineQty}</w:t></w:r>$3'
  );
  // Connected Engines (paraId 2744ACB1)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="2744ACB1"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineConnected}</w:t></w:r>$3'
  );
  // S/N (paraId 10A1C2BE)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="10A1C2BE"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineSN}</w:t></w:r>$3'
  );

  // ─── TABLE 5: Solar ─────────────────────────────────────────────────────────
  // Qty (paraId 19CFD271)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="19CFD271"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarQty}</w:t></w:r>$3'
  );
  // Location (paraId 54C8F9B7)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="54C8F9B7"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarLocation}</w:t></w:r>$3'
  );
  // S/N (paraId 3D20B1F4)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="3D20B1F4"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarSN}</w:t></w:r>$3'
  );
  // Power status (paraId 2A57BAA1) — replace checkbox block
  result = result.replace(
    /(<w:p[^>]*w14:paraId="2A57BAA1"[^>]*>)([\s\S]*?)(<w:p[^>]*w14:paraId="3A7BCADB"[^>]*>[\s\S]*?<\/w:p>)/,
    '$1<w:r><w:t>{solarPowerStatus}</w:t></w:r></w:p>'
  );

  // ─── TABLE 6: Sign-off ──────────────────────────────────────────────────────
  // Technician Name (paraId 5E37B2CE)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="5E37B2CE"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>Name: {techName}</w:t></w:r>$3'
  );
  // Receiver Name (paraId 19D35F3B)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="19D35F3B"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>Name: {receiverName}</w:t></w:r>$3'
  );
  // Tech Designation (paraId 7EBB5577)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="7EBB5577"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>Designation: {techDesignation}</w:t></w:r>$3'
  );
  // Receiver Designation (paraId 73CAB408)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="73CAB408"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>Designation: {receiverDesignation}</w:t></w:r>$3'
  );
  // Date left (paraId 67B46078)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="67B46078"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>Date: {signoffDate}</w:t></w:r>$3'
  );

  // ─── Remarks lines ──────────────────────────────────────────────────────────
  // Replace first underscores line (paraId 045A59BF)
  result = result.replace(
    /(<w:p[^>]*w14:paraId="045A59BF"[^>]*>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:r><w:t>{remarks}</w:t></w:r>$3'
  );
  // Remove subsequent blank lines (paraId 19319535 and 32E306A3)
  result = result.replace(
    /<w:p[^>]*w14:paraId="19319535"[^>]*>[\s\S]*?<\/w:p>/,
    ''
  );
  result = result.replace(
    /<w:p[^>]*w14:paraId="32E306A3"[^>]*>[\s\S]*?<\/w:p>/,
    ''
  );

  return result;
}

function processTemplate(config) {
  const srcPath = path.join(SOURCE_DIR, config.sourceFile);
  const outPath = path.join(TEMPLATES_DIR, config.outputFile);

  console.log(`Processing: ${config.sourceFile} → ${config.outputFile}`);

  if (!fs.existsSync(srcPath)) {
    console.error(`  ❌ Source file not found: ${srcPath}`);
    return;
  }

  const content = fs.readFileSync(srcPath);
  const zip = new PizZip(content);

  let xml = zip.files['word/document.xml'].asText();
  xml = injectPlaceholders(xml);
  zip.file('word/document.xml', xml);

  const outputBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outPath, outputBuffer);
  console.log(`  ✅ Written: ${outPath}`);
}

// Run
configs.forEach(processTemplate);
console.log('\n✅ All templates processed successfully.');
