import type { DailyLogRecord, VoyageDefinition, VoyageResult } from './types';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function rounded(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function overlapHours(start: string, end: string, windowStart: number, windowEnd: number) {
  const intervalStart = Date.parse(start);
  const intervalEnd = Date.parse(end);
  if (!Number.isFinite(intervalStart) || !Number.isFinite(intervalEnd)) return 0;
  return Math.max(0, Math.min(intervalEnd, windowEnd) - Math.max(intervalStart, windowStart)) / HOUR_MS;
}

function coveredDates(startMs: number, endMs: number) {
  const result: string[] = [];
  const cursor = new Date(startMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(endMs - 1);
  last.setUTCHours(0, 0, 0, 0);
  for (let ms = cursor.getTime(); ms <= last.getTime(); ms += DAY_MS) {
    result.push(new Date(ms).toISOString().slice(0, 10));
  }
  return result;
}

export function calculateVoyages(
  dailyLogs: DailyLogRecord[],
  definitions: VoyageDefinition[],
): VoyageResult[] {
  const byDate = new Map(dailyLogs.map((record) => [record.date, record]));

  return definitions.map((definition) => {
    const warnings: string[] = [];
    const departure = Date.parse(definition.departure);
    const arrival = Date.parse(definition.arrival);
    if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) {
      return {
        ...definition,
        transitHours: 0,
        mainEngineFuel: 0,
        auxiliaryEngineFuel: 0,
        totalFuel: 0,
        averageBurn: 0,
        fuelPerNauticalMile: 0,
        warnings: ['Departure and arrival must form a valid positive time window.'],
      };
    }

    const dates = coveredDates(departure, arrival);
    const missingDates = dates.filter((date) => !byDate.has(date));
    if (missingDates.length > 0) {
      warnings.push(`Missing daily reports for ${missingDates.join(', ')}.`);
    }

    let calculatedMainEngineFuel = 0;
    for (const date of dates) {
      const daily = byDate.get(date);
      if (!daily) continue;
      for (const component of daily.components) {
        if (!['port-main-engine', 'starboard-main-engine'].includes(component.category)) continue;
        if (component.workingHours <= 0 || component.fuel <= 0) continue;
        const hourlyRate = component.fuel / component.workingHours;
        for (const interval of component.intervals) {
          calculatedMainEngineFuel += hourlyRate * overlapHours(interval.start, interval.end, departure, arrival);
        }
      }
    }

    // Established rule: combine every AE #... component for each covered date.
    // A one-day voyage receives that full daily AE total; a multi-day voyage
    // receives the average of the covered dates, with missing reports treated as zero.
    const dailyAeTotals = dates.map((date) => byDate.get(date)?.auxiliaryEngineFuel ?? 0);
    const calculatedAuxiliaryEngineFuel = dailyAeTotals.length === 0
      ? 0
      : dailyAeTotals.reduce((sum, value) => sum + value, 0) / dailyAeTotals.length;
    const hasMainOverride = typeof definition.mainEngineFuelOverride === 'number'
      && Number.isFinite(definition.mainEngineFuelOverride)
      && definition.mainEngineFuelOverride >= 0;
    const hasAuxiliaryOverride = typeof definition.auxiliaryEngineFuelOverride === 'number'
      && Number.isFinite(definition.auxiliaryEngineFuelOverride)
      && definition.auxiliaryEngineFuelOverride >= 0;
    const mainEngineFuel = hasMainOverride
      ? definition.mainEngineFuelOverride as number
      : calculatedMainEngineFuel;
    const auxiliaryEngineFuel = hasAuxiliaryOverride
      ? definition.auxiliaryEngineFuelOverride as number
      : calculatedAuxiliaryEngineFuel;
    const transitHours = (arrival - departure) / HOUR_MS;
    const totalFuel = mainEngineFuel + auxiliaryEngineFuel;

    if (mainEngineFuel === 0) warnings.push('No main-engine activity overlaps this voyage window.');
    if (auxiliaryEngineFuel === 0) warnings.push('No auxiliary-engine fuel was found for this voyage.');
    if (definition.distance <= 0) warnings.push('Distance is missing or zero.');

    return {
      ...definition,
      transitHours: rounded(transitHours),
      mainEngineFuel: rounded(mainEngineFuel),
      auxiliaryEngineFuel: rounded(auxiliaryEngineFuel),
      totalFuel: rounded(totalFuel),
      averageBurn: transitHours > 0 ? rounded(totalFuel / transitHours) : 0,
      fuelPerNauticalMile: definition.distance > 0 ? rounded(totalFuel / definition.distance) : 0,
      warnings,
    };
  });
}
