import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { calculateVoyages } from '@/lib/voyage/calculations';
import { suggestVoyageDefinitions } from '@/lib/voyage/detection';
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
  return NextResponse.json({ dailyLogs: [], voyages: [], warnings: [] });
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
    const selectedDefinitions = suggestVoyageDefinitions(dailyLogs);
    const voyages = calculateVoyages(dailyLogs, selectedDefinitions);
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
