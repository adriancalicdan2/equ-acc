import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { generateDocx } from '@/lib/docx/generateDocx';
import { TemplateData, PhotoSet, CopyType } from '@/types/form';
import { getAccessTokenFromRefreshToken, createGoogleFolderServer, uploadFileServer } from '@/lib/googleDriveServer';

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

    const uploadToDrive = formData.get('uploadToDrive') === 'true';

    // Generate each selected DOCX
    const fileNames: Record<CopyType, string> = {
      aimf: 'Equipment-Accountability-AIMF-Copy.docx',
      vessel: 'Equipment-Accountability-Vessel-Copy.docx',
      vessel_owner: 'Equipment-Accountability-VesselOwner-Copy.docx',
    };

    if (uploadToDrive) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
      const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

      if (!clientId || !clientSecret || !refreshToken || !parentFolderId) {
        return NextResponse.json(
          { error: 'Google OAuth variables (Client ID, Client Secret, Refresh Token, or Parent Folder ID) are not configured on the server.' },
          { status: 500 }
        );
      }

      const token = await getAccessTokenFromRefreshToken(clientId, clientSecret, refreshToken);
      const folderName = `${data.vesselName.trim()} - Equipment accountability reports`;
      const folderId = await createGoogleFolderServer(folderName, parentFolderId, token);

      for (const ct of copyTypes) {
        const docxBuffer = await generateDocx(data, photos, ct);
        await uploadFileServer(fileNames[ct], docxBuffer, folderId, token);
      }

      return NextResponse.json({
        success: true,
        folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        folderName
      });
    }

    const zip = new JSZip();
    for (const ct of copyTypes) {
      const docxBuffer = await generateDocx(data, photos, ct);
      // Use STORE (no compression) for docx files — they are already
      // internally compressed. Re-applying DEFLATE corrupts them.
      zip.file(fileNames[ct], docxBuffer, { compression: 'STORE' });
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Equipment-Accountability-Report.zip"`,
        'Content-Length': String(zipBuffer.length),
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
