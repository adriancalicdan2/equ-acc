import 'server-only';

import type { NextRequest } from 'next/server';
import { parseWorkTimeWorkbook } from './parser';
import type { DailyLogRecord } from './types';

const MAX_FILES = 75;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

export async function parseVoyageUploadRequest(
  request: NextRequest,
  options: { allowEmpty?: boolean } = {},
) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_TOTAL_BYTES) throw new Error('The combined upload must be 30 MB or smaller.');

  const formData = await request.formData();
  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0 && !options.allowEmpty) {
    throw new Error('Select at least one .xls or .xlsx daily report.');
  }
  if (files.length > MAX_FILES) throw new Error(`Upload no more than ${MAX_FILES} workbooks at once.`);

  let totalBytes = 0;
  const dailyLogs: DailyLogRecord[] = [];
  for (const file of files) {
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('The combined upload must be 30 MB or smaller.');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      dailyLogs.push(parseWorkTimeWorkbook(file.name, bytes));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid workbook';
      throw new Error(`${file.name}: ${message}`);
    }
  }

  dailyLogs.sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  for (const daily of dailyLogs) {
    if (seen.has(daily.date)) throw new Error(`More than one report was uploaded for ${daily.date}.`);
    seen.add(daily.date);
  }

  return { formData, dailyLogs };
}
