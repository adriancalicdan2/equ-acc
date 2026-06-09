import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const templates = [
  ['AIMF', 'EQUIPMENT ACCOUNTABILITY - AIMF.docx'],
  ['Vessel', 'EQUIPMENT ACCOUNTABILITY - Vessel.docx'],
  ['Vessel Owner', 'EQUIPMENT ACCOUNTABILITY - Vessel Owner.docx'],
];

for (const [name, filename] of templates) {
  const tplPath = path.join(projectRoot, 'public', 'templates', filename);
  const content = fs.readFileSync(tplPath);
  const zip = new PizZip(content);
  
  console.log(`\n=== ${name} ===`);
  console.log('Files in zip:');
  for (const [fname, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      console.log(`  ${fname} (${file._data?.compressedSize ?? '?'} bytes compressed)`);
    }
  }
  
  // Check [Content_Types].xml
  const ct = zip.files['[Content_Types].xml']?.asText() ?? '';
  const imageTypes = ct.match(/ContentType="image[^"]+"/g) ?? [];
  console.log('Image content types:', imageTypes.length ? imageTypes.join(', ') : 'NONE');
  
  // Check word/_rels/document.xml.rels for image relationships
  const rels = zip.files['word/_rels/document.xml.rels']?.asText() ?? '';
  const imageRels = rels.match(/Type="[^"]*image[^"]*"/g) ?? [];
  console.log('Image relationships:', imageRels.length ? imageRels.join(', ') : 'NONE');
  
  // Check if there are any image files embedded
  const imageFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'));
  console.log('Embedded images:', imageFiles.length ? imageFiles.join(', ') : 'NONE');
}
