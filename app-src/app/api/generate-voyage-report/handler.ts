import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { calculateVoyages } from '@/lib/voyage/calculations';
import {
  dailyInDateRange,
  mergeDailyLogs,
  validateDateRange,
  voyageInDateRange,
} from '@/lib/voyage/manual';
import {
  manualDailyLogInputSchema,
  reportDateSchema,
  vesselNameSchema,
  voyageDefinitionSchema,
} from '@/lib/voyage/schemas';
import { generateVoyageWorkbook, loadVoyageTemplateData } from '@/lib/voyage/template';
import { parseVoyageUploadRequest } from '@/lib/voyage/upload';
import { detectedVesselNames, vesselFileStem } from '@/lib/voyage/vessel';

function parseJsonField<T>(
  formData: FormData,
  field: string,
  schema: z.ZodType<T>,
  fallback: T,
  maxLength: number,
) {
  const raw = formData.get(field);
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  if (raw.length > maxLength) throw new Error(`${field} data is too large.`);
  return schema.parse(JSON.parse(raw));
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { view: 'daily-logs-voyages' });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`generate-voyage:${authorization.token.uid}`, 10, 60_000);
  if (rateLimited) return rateLimited;

  try {
    const { formData, dailyLogs: uploadedLogs } = await parseVoyageUploadRequest(request, { allowEmpty: true });
    const templateData = await loadVoyageTemplateData();
    const definitions = parseJsonField(
      formData,
      'voyages',
      z.array(voyageDefinitionSchema).min(1).max(100),
      templateData.definitions,
      150_000,
    );
    const manualInputs = parseJsonField(
      formData,
      'manualLogs',
      z.array(manualDailyLogInputSchema).max(100),
      [],
      250_000,
    );
    const vesselName = vesselNameSchema.parse(formData.get('vesselName'));
    const dateFrom = reportDateSchema.parse(formData.get('dateFrom'));
    const dateTo = reportDateSchema.parse(formData.get('dateTo'));
    if (!validateDateRange(dateFrom, dateTo)) throw new Error('Select a valid From and To date range.');
    const detectedVessels = detectedVesselNames(uploadedLogs);
    if (detectedVessels.length > 1) {
      throw new Error(`The uploaded files contain more than one vessel: ${detectedVessels.join(', ')}.`);
    }

    for (const daily of uploadedLogs) {
      const metadata = templateData.dailyMetadata.get(daily.date);
      if (metadata) {
        daily.location = metadata.location;
        daily.activity = metadata.activity;
      }
    }
    const allDailyLogs = mergeDailyLogs(uploadedLogs, manualInputs, vesselName);
    if (allDailyLogs.length === 0) throw new Error('Add a manual entry or upload at least one daily report.');
    const allVoyages = calculateVoyages(allDailyLogs, definitions);
    const filteredDailyLogs = allDailyLogs.filter((daily) => dailyInDateRange(daily, dateFrom, dateTo));
    const filteredVoyages = allVoyages.filter((voyage) => voyageInDateRange(voyage, dateFrom, dateTo));
    const buffer = await generateVoyageWorkbook(filteredDailyLogs, filteredVoyages, vesselName);
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${vesselFileStem(vesselName)}-${dateFrom}-to-${dateTo}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[generate-voyage-report] Error:', error);
    const message = error instanceof Error ? error.message : 'Unable to generate the voyage workbook.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
