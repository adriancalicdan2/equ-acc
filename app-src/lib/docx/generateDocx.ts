import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ImageModule from 'docxtemplater-image-module-free';
import fs from 'fs';
import path from 'path';
import { TemplateData, PhotoSet, CopyType } from '@/types/form';
import { processImages } from './imageProcessor';

const COPY_LABEL: Record<CopyType, string> = {
  aimf: 'AIMF Copy',
  vessel: 'Vessel Copy',
  vessel_owner: 'Vessel Owner Copy',
};

// Maps copy type to source docx filename (in the root workspace)
const SOURCE_DOCX: Record<CopyType, string> = {
  aimf: 'EQUIPMENT ACCOUNTABILITY - AIMF.docx',
  vessel: 'EQUIPMENT ACCOUNTABILITY - Vessel.docx',
  vessel_owner: 'EQUIPMENT ACCOUNTABILITY - Vessel Owner.docx',
};

function getTemplatePath(copyType: CopyType): string {
  // First try templates in the public directory (copied automatically by Next.js builder)
  const publicTemplatePath = path.join(process.cwd(), 'public', 'templates', `${copyType}-template.docx`);
  if (fs.existsSync(publicTemplatePath)) return publicTemplatePath;

  // Try templates folder directly
  const templatePath = path.join(process.cwd(), 'templates', `${copyType}-template.docx`);
  if (fs.existsSync(templatePath)) return templatePath;

  // Try workspace root directory (parent of process.cwd())
  const parentDir = path.join(process.cwd(), '..');
  const srcPathP = path.join(parentDir, SOURCE_DOCX[copyType]);
  if (fs.existsSync(srcPathP)) return srcPathP;

  // Try workspace parent directory (grandparent of process.cwd())
  const grandparentDir = path.join(process.cwd(), '..', '..');
  const srcPathGp = path.join(grandparentDir, SOURCE_DOCX[copyType]);
  if (fs.existsSync(srcPathGp)) return srcPathGp;

  throw new Error(`Template not found for copy type: ${copyType}. Searched public: ${publicTemplatePath}, templates: ${templatePath}, srcParent: ${srcPathP}`);
}

function injectPlaceholdersIntoXml(xml: string, copyType: CopyType): string {
  let result = xml;

  // Vessel Info Table values
  result = result.replace(/(<w:p[^>]*w14:paraId="22EEEEC4"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{vesselName}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="5DC70186"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{installationDate}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="38BEF448"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{leadEngineer}</w:t></w:r>$3');

  // FLS Capacitance
  result = result.replace(/(<w:p[^>]*w14:paraId="3625934D"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="5A90C26B"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceTank}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="7E7F6DB7"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsCapacitanceSN}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="79A1066E"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{flsCapacitanceStatus}</w:t></w:r>$3');

  // FLS Floater
  result = result.replace(/(<w:p[^>]*w14:paraId="5F4E7F5A"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="617880BA"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterTank}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="66EF4206"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{flsFloaterSN}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="03C4D3F3"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{flsFloaterStatus}</w:t></w:r>$3');

  // Network
  result = result.replace(/(<w:p[^>]*w14:paraId="6F5761A3"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{networkQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="0649AFD1"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{networkSN}</w:t></w:r>$3');
  // Signal status: replace the multi-paragraph checkbox block
  result = result.replace(
    /(<w:p[^>]*w14:paraId="53EA934E"[^>]*>)[\s\S]*?(<w:p[^>]*w14:paraId="58AF202E"[^>]*>[\s\S]*?<\/w:p>)/,
    '$1<w:r><w:t>{networkSignalStatus}</w:t></w:r></w:p>'
  );

  // Engine
  result = result.replace(/(<w:p[^>]*w14:paraId="4A5E85ED"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="2744ACB1"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineConnected}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="10A1C2BE"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{engineSN}</w:t></w:r>$3');

  // Solar
  result = result.replace(/(<w:p[^>]*w14:paraId="19CFD271"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarQty}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="54C8F9B7"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarLocation}</w:t></w:r>$3');
  result = result.replace(/(<w:p[^>]*w14:paraId="3D20B1F4"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{solarSN}</w:t></w:r>$3');
  result = result.replace(
    /(<w:p[^>]*w14:paraId="2A57BAA1"[^>]*>)[\s\S]*?(<w:p[^>]*w14:paraId="3A7BCADB"[^>]*>[\s\S]*?<\/w:p>)/,
    '$1<w:r><w:t>{solarPowerStatus}</w:t></w:r></w:p>'
  );

  // Remarks
  result = result.replace(/(<w:p[^>]*w14:paraId="045A59BF"[^>]*>)([\s\S]*?)(<\/w:p>)/, '$1<w:r><w:t>{remarks}</w:t></w:r>$3');
  result = result.replace(/<w:p[^>]*w14:paraId="19319535"[^>]*>[\s\S]*?<\/w:p>/, '');
  result = result.replace(/<w:p[^>]*w14:paraId="32E306A3"[^>]*>[\s\S]*?<\/w:p>/, '');



  return result;
}

function buildPhotoTableXml(
  photos: { data: Buffer; width: number; height: number }[],
  prefix: string
): string {
  if (photos.length === 0) return '';

  const cells = photos
    .slice(0, 3)
    .map(
      (_, i) =>
        `<w:tc><w:tcPr><w:tcW w:w="3518" w:type="dxa"/></w:tcPr>` +
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
        `<w:r><w:rPr></w:rPr><w:t>{%${prefix}Photo${i + 1}}</w:t></w:r></w:p></w:tc>`
    )
    .join('');

  // Pad to 3 cells if fewer photos
  const emptyCell =
    '<w:tc><w:tcPr><w:tcW w:w="3518" w:type="dxa"/></w:tcPr><w:p/></w:tc>';
  const padding = Array(3 - photos.length)
    .fill(emptyCell)
    .join('');

  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>` +
    `<w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblLook w:val="04A0"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="3518"/><w:gridCol w:w="3518"/><w:gridCol w:w="3518"/></w:tblGrid>` +
    `<w:tr>${cells}${padding}</w:tr></w:tbl>`
  );
}

// Caption constants for section heading lookup
const SECTION_BREAK_PARA_IDS: Record<string, string> = {
  fls: '7A76036B',     // paragraph after FLS section
  network: '1B81CB9C', // paragraph after Network section
  engine: '500EC034',  // paragraph after Engine section (empty para)
};

function injectPhotoTablesIntoXml(
  xml: string,
  flsPhotos: { data: Buffer; width: number; height: number }[],
  networkPhotos: { data: Buffer; width: number; height: number }[],
  enginePhotos: { data: Buffer; width: number; height: number }[],
  solarPhotos: { data: Buffer; width: number; height: number }[]
): string {
  let result = xml;

  const flsTbl = buildPhotoTableXml(flsPhotos, 'fls');
  const networkTbl = buildPhotoTableXml(networkPhotos, 'network');
  const engineTbl = buildPhotoTableXml(enginePhotos, 'engine');
  const solarTbl = buildPhotoTableXml(solarPhotos, 'solar');

  // Insert FLS photo table just before the "Network" section heading (paraId 7A76036B)
  if (flsTbl) {
    result = result.replace(
      /(<w:p[^>]*w14:paraId="7A76036B"[^>]*>)/,
      `${flsTbl}$1`
    );
  }
  // Insert Network photo table just before "Engine" section heading (paraId 1B81CB9C)
  if (networkTbl) {
    result = result.replace(
      /(<w:p[^>]*w14:paraId="1B81CB9C"[^>]*>)/,
      `${networkTbl}$1`
    );
  }
  // Insert Engine photo table just before first empty paragraph after engine section (paraId 500EC034)
  if (engineTbl) {
    result = result.replace(
      /(<w:p[^>]*w14:paraId="500EC034"[^>]*>)/,
      `${engineTbl}$1`
    );
  }
  // Insert Solar photo table just before Remarks section (paraId 1A9ADCE2)
  if (solarTbl) {
    result = result.replace(
      /(<w:p[^>]*w14:paraId="1A9ADCE2"[^>]*>)/,
      `${solarTbl}$1`
    );
  }

  return result;
}

function nullImageBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );
}

export async function generateDocx(
  data: TemplateData,
  photos: PhotoSet,
  copyType: CopyType
): Promise<Buffer> {
  const templatePath = getTemplatePath(copyType);
  const templateContent = fs.readFileSync(templatePath);
  const zip = new PizZip(templateContent);

  // Process & resize photos
  const [flsImgs, networkImgs, engineImgs, solarImgs] = await Promise.all([
    processImages(photos.flsPhotos),
    processImages(photos.networkPhotos),
    processImages(photos.enginePhotos),
    processImages(photos.solarPhotos),
  ]);

  // Build image lookup for the image module
  const imageMap: Record<string, Buffer> = {};
  const sizeMap: Record<string, [number, number]> = {};

  const registerPhotos = (
    imgs: { data: Buffer; width: number; height: number }[],
    prefix: string
  ) => {
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

  // Inject placeholders into document.xml
  let docXml: string = zip.files['word/document.xml'].asText();
  docXml = injectPlaceholdersIntoXml(docXml, copyType);
  docXml = injectPhotoTablesIntoXml(docXml, flsImgs, networkImgs, engineImgs, solarImgs);
  zip.file('word/document.xml', docXml);

  // Configure image module
  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage(tag: string) {
      return imageMap[tag] ?? nullImageBuffer();
    },
    getSize(tag: string) {
      return sizeMap[tag] ?? [1, 1];
    },
  });

  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render({
    ...data,
    copyLabel: COPY_LABEL[copyType],
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
