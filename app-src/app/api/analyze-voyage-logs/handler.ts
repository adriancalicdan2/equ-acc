import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { calculateVoyages } from '@/lib/voyage/calculations';
import { loadVoyageTemplateData } from '@/lib/voyage/template';
import { parseVoyageUploadRequest } from '@/lib/voyage/upload';
import { detectedVesselNames } from '@/lib/voyage/vessel';

async function authorize(request: NextRequest, operation: string) {
  const authorization = await authorizeRequest(request, { view: 'daily-logs-voyages' });
  if (!authorization.authorized) return authorization;
  const rateLimited = enforceRateLimit(`${operation}:${authorization.token.uid}`, 10, 60_000);
  return rateLimited ? { authorized: false as const, response: rateLimited } : authorization;
}

export async function GET(request: NextRequest) {
  const authorization = await authorize(request, 'load-voyage-template');
  if (!authorization.authorized) return authorization.response;
  try {
    const { definitions } = await loadVoyageTemplateData();
    return NextResponse.json({
      dailyLogs: [],
      voyages: calculateVoyages([], definitions),
      warnings: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load the vessel report template.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorize(request, 'analyze-voyage');
  if (!authorization.authorized) return authorization.response;
  try {
    const { dailyLogs } = await parseVoyageUploadRequest(request);
    const detectedVessels = detectedVesselNames(dailyLogs);
    if (detectedVessels.length > 1) {
      throw new Error(`The uploaded files contain more than one vessel: ${detectedVessels.join(', ')}.`);
    }
    const { definitions, dailyMetadata } = await loadVoyageTemplateData();
    for (const daily of dailyLogs) {
      const metadata = dailyMetadata.get(daily.date);
      if (metadata) {
        daily.location = metadata.location;
        daily.activity = metadata.activity;
      } else {
        daily.warnings.push('Location and activity are not present in the template for this date.');
      }
    }
    const voyages = calculateVoyages(dailyLogs, definitions);
    const warnings = [
      ...dailyLogs.flatMap((daily) => daily.warnings.map((warning) => `${daily.date}: ${warning}`)),
      ...voyages.flatMap((voyage) => voyage.warnings.map((warning) => `${voyage.id}: ${warning}`)),
    ];
    return NextResponse.json({ dailyLogs, voyages, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze the uploaded workbooks.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
