import type { DailyLogRecord } from './types';

export function cleanVesselName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function vesselFileStem(value: string) {
  const stem = cleanVesselName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || 'Vessel';
}

export function detectedVesselNames(records: DailyLogRecord[]) {
  const names = new Map<string, string>();
  for (const record of records) {
    const name = cleanVesselName(record.vesselName);
    if (name) names.set(name.toLocaleLowerCase('en-US'), name);
  }
  return [...names.values()];
}
