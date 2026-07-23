import type {
  DailyLogRecord,
  ManualDailyLogInput,
  VoyageDefinition,
} from './types';
import { cleanVesselName } from './vessel.ts';

const DAY_MS = 86_400_000;

function rounded(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function manualInputToDailyLog(
  input: ManualDailyLogInput,
  vesselName = '',
): DailyLogRecord {
  const ancillaryFuel = rounded(input.auxiliaryEngineFuel + input.otherFuel);
  return {
    source: 'manual',
    fileName: `Manual entry ${input.id}`,
    vesselName: cleanVesselName(vesselName),
    date: input.date,
    location: input.location.trim(),
    activity: input.activity.trim(),
    portHours: input.portHours,
    starboardHours: input.starboardHours,
    mainEngineFuel: input.mainEngineFuel,
    auxiliaryEngineFuel: input.auxiliaryEngineFuel,
    ancillaryFuel,
    totalFuel: rounded(input.mainEngineFuel + ancillaryFuel),
    components: [],
    warnings: input.mainEngineFuel > 0
      ? ['Manual daily totals have no engine operating intervals; enter voyage ME fuel directly when needed.']
      : [],
  };
}

export function mergeDailyLogs(
  uploaded: DailyLogRecord[],
  manualInputs: ManualDailyLogInput[],
  vesselName = '',
) {
  const selectedVessel = cleanVesselName(vesselName);
  const combined = [
    ...uploaded.map((daily) => ({
      ...daily,
      vesselName: selectedVessel || daily.vesselName,
    })),
    ...manualInputs.map((input) => manualInputToDailyLog(input, selectedVessel)),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  for (const daily of combined) {
    if (seen.has(daily.date)) {
      throw new Error(`More than one daily entry exists for ${daily.date}.`);
    }
    seen.add(daily.date);
  }
  return combined;
}

export function validateDateRange(dateFrom: string, dateTo: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(dateFrom) || !/^20\d{2}-\d{2}-\d{2}$/.test(dateTo)) {
    return false;
  }
  const from = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const to = Date.parse(`${dateTo}T00:00:00.000Z`);
  return Number.isFinite(from) && Number.isFinite(to) && from <= to;
}

export function dailyInDateRange(daily: DailyLogRecord, dateFrom: string, dateTo: string) {
  return daily.date >= dateFrom && daily.date <= dateTo;
}

export function voyageInDateRange(
  voyage: VoyageDefinition,
  dateFrom: string,
  dateTo: string,
) {
  const rangeStart = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const rangeEnd = Date.parse(`${dateTo}T00:00:00.000Z`) + DAY_MS;
  const departure = Date.parse(voyage.departure);
  const arrival = Date.parse(voyage.arrival);
  return Number.isFinite(departure)
    && Number.isFinite(arrival)
    && arrival > rangeStart
    && departure < rangeEnd;
}
