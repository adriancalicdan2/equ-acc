import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { generateDocx } from '@/lib/docx/generateDocx';
import type { TemplateData, PhotoSet, CopyType } from '@/types/form';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { rejectOversizedRequest } from '@/lib/server/request';
import { docxTextSchema } from '@/lib/validations/apiSchemas';

const MAX_REQUEST_BYTES = 35_000_000;
const MAX_PHOTO_BYTES = 8_000_000;
const MAX_TOTAL_PHOTO_BYTES = 30_000_000;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function formatCalibrationStatus(value: string): string {
  return value === 'good' ? '✔ Good Working Condition' : '✘ Defective';
}

function formatSignalStatus(value: string): string {
  return ({ excellent: '✔ Excellent', good: '✔ Good', poor: '✘ Poor' } as Record<string, string>)[value] ?? value;
}

function formatPowerStatus(value: string): string {
  return ({
    fully_charged: '✔ Fully Charged',
    charging: '✔ Charging',
    operational: '✔ Operational',
  } as Record<string, string>)[value] ?? value;
}

async function extractPhotos(formData: FormData, key: string): Promise<Buffer[]> {
  const values = formData.getAll(key);
  const buffers: Buffer[] = [];

  for (const value of values) {
    if (!(value instanceof File) || value.size === 0) continue;
    if (value.size > MAX_PHOTO_BYTES) throw new Error('Each photo must be 8 MB or smaller');
    if (!ACCEPTED_IMAGE_TYPES.has(value.type)) throw new Error(`Unsupported photo type: ${value.type || 'unknown'}`);
    buffers.push(Buffer.from(await value.arrayBuffer()));
  }

  return buffers;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { view: 'equipment-accountability' });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`generate-docx:${authorization.token.uid}`, 10, 60_000);
  if (rateLimited) return rateLimited;

  const oversized = rejectOversizedRequest(request, MAX_REQUEST_BYTES);
  if (oversized) return oversized;

  try {
    const formData = await request.formData();
    let copyTypes: unknown;
    try {
      copyTypes = JSON.parse(text(formData, 'copyTypes'));
    } catch {
      return NextResponse.json({ error: 'copyTypes must be valid JSON' }, { status: 400 });
    }

    const parsed = docxTextSchema.safeParse({
      vesselName: text(formData, 'vesselName'),
      installationDate: text(formData, 'installationDate'),
      leadEngineer: text(formData, 'leadEngineer'),
      flsCapacitanceQty: text(formData, 'flsCapacitanceQty'),
      flsCapacitanceTank: text(formData, 'flsCapacitanceTank'),
      flsCapacitanceSN: text(formData, 'flsCapacitanceSN'),
      flsCapacitanceStatus: text(formData, 'flsCapacitanceStatus'),
      flsFloaterQty: text(formData, 'flsFloaterQty'),
      flsFloaterTank: text(formData, 'flsFloaterTank'),
      flsFloaterSN: text(formData, 'flsFloaterSN'),
      flsFloaterStatus: text(formData, 'flsFloaterStatus'),
      networkQty: text(formData, 'networkQty'),
      networkSN: text(formData, 'networkSN'),
      networkSignalStatus: text(formData, 'networkSignalStatus'),
      engineQty: text(formData, 'engineQty'),
      engineConnected: text(formData, 'engineConnected'),
      engineSN: text(formData, 'engineSN'),
      solarQty: text(formData, 'solarQty'),
      solarLocation: text(formData, 'solarLocation'),
      solarSN: text(formData, 'solarSN'),
      solarPowerStatus: text(formData, 'solarPowerStatus'),
      remarks: text(formData, 'remarks'),
      techName: text(formData, 'techName'),
      techDesignation: text(formData, 'techDesignation'),
      signoffDate: text(formData, 'signoffDate'),
      receiverName: text(formData, 'receiverName'),
      receiverDesignation: text(formData, 'receiverDesignation'),
      copyTypes,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid report data', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const data: TemplateData = {
      vesselName: input.vesselName,
      installationDate: input.installationDate,
      leadEngineer: input.leadEngineer,
      flsCapacitanceQty: input.flsCapacitanceQty,
      flsCapacitanceTank: input.flsCapacitanceTank,
      flsCapacitanceSN: input.flsCapacitanceSN,
      flsCapacitanceStatus: formatCalibrationStatus(input.flsCapacitanceStatus),
      flsFloaterQty: input.flsFloaterQty,
      flsFloaterTank: input.flsFloaterTank,
      flsFloaterSN: input.flsFloaterSN,
      flsFloaterStatus: formatCalibrationStatus(input.flsFloaterStatus),
      networkQty: input.networkQty,
      networkSN: input.networkSN,
      networkSignalStatus: formatSignalStatus(input.networkSignalStatus),
      engineQty: input.engineQty,
      engineConnected: input.engineConnected,
      engineSN: input.engineSN,
      solarQty: input.solarQty,
      solarLocation: input.solarLocation,
      solarSN: input.solarSN,
      solarPowerStatus: formatPowerStatus(input.solarPowerStatus),
      remarks: input.remarks && input.remarks !== 'None' ? input.remarks : 'Installation done properly',
      techName: input.techName,
      techDesignation: input.techDesignation,
      signoffDate: input.signoffDate,
      receiverName: input.receiverName,
      receiverDesignation: input.receiverDesignation,
    };

    const photos: PhotoSet = {
      flsPhotos: await extractPhotos(formData, 'flsPhotos'),
      networkPhotos: await extractPhotos(formData, 'networkPhotos'),
      enginePhotos: await extractPhotos(formData, 'enginePhotos'),
      solarPhotos: await extractPhotos(formData, 'solarPhotos'),
    };
    const totalPhotoBytes = Object.values(photos).flat().reduce((total, photo) => total + photo.length, 0);
    if (totalPhotoBytes > MAX_TOTAL_PHOTO_BYTES) {
      return NextResponse.json({ error: 'Combined photos must be 30 MB or smaller' }, { status: 413 });
    }

    const fileNames: Record<CopyType, string> = {
      aimf: 'Equipment-Accountability-AIMF-Copy.docx',
      vessel: 'Equipment-Accountability-Vessel-Copy.docx',
      vessel_owner: 'Equipment-Accountability-VesselOwner-Copy.docx',
      likas: 'Equipment-Accountability-Likas-Copy.docx',
    };
    const zip = new JSZip();
    for (const copyType of input.copyTypes) {
      zip.file(fileNames[copyType], await generateDocx(data, photos, copyType), { compression: 'STORE' });
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="Equipment-Accountability-Report.zip"',
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('[generate-docx] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('photo') || message.includes('Unsupported') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
