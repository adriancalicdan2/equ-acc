import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { mergeDailyLogs } from '@/lib/voyage/manual';
import {
  dailyLogRecordSchema,
  manualDailyLogInputSchema,
  vesselNameSchema,
} from '@/lib/voyage/schemas';
import { generateCombinedDataWorkbook } from '@/lib/voyage/combinedDataTemplate';
import { parseVoyageUploadRequest } from '@/lib/voyage/upload';
import { vesselFileStem } from '@/lib/voyage/vessel';

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
  const rateLimited = enforceRateLimit(`generate-combined-data:${authorization.token.uid}`, 10, 60_000);
  if (rateLimited) return rateLimited;

  try {
    const { formData, dailyLogs: uploadedLogs } = await parseVoyageUploadRequest(request, { allowEmpty: true });
    const manualInputs = parseJsonField(
      formData,
      'manualLogs',
      z.array(manualDailyLogInputSchema).max(100),
      [],
      250_000,
    );
    const savedLogs = parseJsonField(
      formData,
      'savedLogs',
      z.array(dailyLogRecordSchema).max(1_000),
      [],
      5_000_000,
    );
    const vesselName = vesselNameSchema.parse(formData.get('vesselName'));

    const allDailyLogs = mergeDailyLogs([...savedLogs, ...uploadedLogs], manualInputs, vesselName);
    if (allDailyLogs.length === 0) {
      throw new Error('Add a manual entry or upload at least one daily report.');
    }

    const buffer = await generateCombinedDataWorkbook(allDailyLogs, vesselName);
    const stem = vesselFileStem(vesselName);
    const sorted = [...allDailyLogs].sort((a, b) => a.date.localeCompare(b.date));
    const dateRange = sorted.length > 0
      ? `${sorted[0].date}-to-${sorted.at(-1)!.date}`
      : 'all-dates';
    const filename = `${stem}-combined-data-${dateRange}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-AIMF-Daily-Count': String(allDailyLogs.length),
      },
    });
  } catch (error) {
    console.error('[generate-combined-data] Error:', error);
    const message = error instanceof Error ? error.message : 'Unable to generate the combined data workbook.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
