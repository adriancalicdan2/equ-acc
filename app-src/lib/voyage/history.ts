import type { DailyLogRecord } from './types';
import { cleanVesselName, vesselFileStem } from './vessel.ts';

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function vesselHistoryId(vesselName: string) {
  const normalized = cleanVesselName(vesselName).toLocaleLowerCase('en-US');
  return `${vesselFileStem(normalized).toLocaleLowerCase('en-US')}-${fnv1a(normalized)}`;
}

export function appendDailyLogHistory(
  existing: DailyLogRecord[],
  incoming: DailyLogRecord[],
  vesselName: string,
) {
  const existingDates = new Set(existing.map((daily) => daily.date));
  const incomingByDate = new Map<string, DailyLogRecord>();

  for (const daily of incoming) {
    if (incomingByDate.has(daily.date)) {
      throw new Error(`More than one daily entry exists for ${daily.date}.`);
    }
    incomingByDate.set(daily.date, {
      ...daily,
      vesselName: cleanVesselName(vesselName),
    });
  }

  const newLogs = [...incomingByDate.values()]
    .filter((daily) => !existingDates.has(daily.date));
  return {
    dailyLogs: [...existing, ...newLogs]
      .sort((left, right) => left.date.localeCompare(right.date)),
    added: newLogs.length,
    skipped: incomingByDate.size - newLogs.length,
  };
}

export function duplicateDailyLogDates(
  existing: DailyLogRecord[],
  incoming: DailyLogRecord[],
) {
  const existingDates = new Set(existing.map((daily) => daily.date));
  return [...new Set(
    incoming
      .filter((daily) => existingDates.has(daily.date))
      .map((daily) => daily.date),
  )].sort();
}
