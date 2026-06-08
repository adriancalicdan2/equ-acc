import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { generateDocx } from '@/lib/docx/generateDocx';
import { TemplateData, PhotoSet, CopyType } from '@/types/form';

function formatCalibrationStatus(val: string): string {
  return val === 'good' ? '✔ Good Working Condition' : '✘ Defective';
}

function formatSignalStatus(val: string): string {
  const map: Record<string, string> = {
    excellent: '✔ Excellent',
    good: '✔ Good',
    poor: '✘ Poor',
  };
  return map[val] ?? val;
}

function formatPowerStatus(val: string): string {
  const map: Record<string, string> = {
    fully_charged: '✔ Fully Charged',
    charging: '✔ Charging',
    operational: '✔ Operational',
  };
  return map[val] ?? val;
}

async function extractPhotos(formData: FormData, key: string): Promise<Buffer[]> {
  const files = formData.getAll(key) as File[];
  const buffers: Buffer[] = [];
  for (const file of files) {
    if (file && file.size > 0) {
      const ab = await file.arrayBuffer();
      buffers.push(Buffer.from(ab));
    }
  }
  return buffers;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Parse text fields
    const data: TemplateData = {
      vesselName: formData.get('vesselName') as string,
      installationDate: formData.get('installationDate') as string,
      leadEngineer: formData.get('leadEngineer') as string,

      flsCapacitanceQty: formData.get('flsCapacitanceQty') as string,
      flsCapacitanceTank: formData.get('flsCapacitanceTank') as string,
      flsCapacitanceSN: formData.get('flsCapacitanceSN') as string,
      flsCapacitanceStatus: formatCalibrationStatus(formData.get('flsCapacitanceStatus') as string),

      flsFloaterQty: formData.get('flsFloaterQty') as string,
      flsFloaterTank: formData.get('flsFloaterTank') as string,
      flsFloaterSN: formData.get('flsFloaterSN') as string,
      flsFloaterStatus: formatCalibrationStatus(formData.get('flsFloaterStatus') as string),

      networkQty: formData.get('networkQty') as string,
      networkSN: formData.get('networkSN') as string,
      networkSignalStatus: formatSignalStatus(formData.get('networkSignalStatus') as string),

      engineQty: formData.get('engineQty') as string,
      engineConnected: formData.get('engineConnected') as string,
      engineSN: formData.get('engineSN') as string,

      solarQty: formData.get('solarQty') as string,
      solarLocation: formData.get('solarLocation') as string,
      solarSN: formData.get('solarSN') as string,
      solarPowerStatus: formatPowerStatus(formData.get('solarPowerStatus') as string),

      remarks: (() => {
        const r = (formData.get('remarks') as string || '').trim();
        return (r && r !== 'None') ? r : 'Installation done properly';
      })(),

      techName: formData.get('techName') as string,
      techDesignation: formData.get('techDesignation') as string,
      signoffDate: formData.get('signoffDate') as string,
      receiverName: formData.get('receiverName') as string,
      receiverDesignation: formData.get('receiverDesignation') as string,
    };

    const copyTypesRaw = formData.get('copyTypes') as string;
    const copyTypes = JSON.parse(copyTypesRaw) as CopyType[];

    // Extract photo buffers
    const photos: PhotoSet = {
      flsPhotos: await extractPhotos(formData, 'flsPhotos'),
      networkPhotos: await extractPhotos(formData, 'networkPhotos'),
      enginePhotos: await extractPhotos(formData, 'enginePhotos'),
      solarPhotos: await extractPhotos(formData, 'solarPhotos'),
    };

    // Generate each selected DOCX
    const zip = new JSZip();
    const fileNames: Record<CopyType, string> = {
      aimf: 'Equipment-Accountability-AIMF-Copy.docx',
      vessel: 'Equipment-Accountability-Vessel-Copy.docx',
      vessel_owner: 'Equipment-Accountability-VesselOwner-Copy.docx',
    };

    for (const ct of copyTypes) {
      const docxBuffer = await generateDocx(data, photos, ct);
      zip.file(fileNames[ct], docxBuffer);
    }

    const zipBuffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Equipment-Accountability-Report.zip"`,
      },
    });
  } catch (err) {
    console.error('[generate-docx] Error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
