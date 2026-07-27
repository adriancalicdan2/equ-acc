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

function mergedOverlapHours(intervals: Array<{ start: number; end: number }>) {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let currentStart = 0;
  let currentEnd = 0;
  for (const interval of sorted) {
    if (currentEnd === 0 || interval.start > currentEnd) {
      if (currentEnd > currentStart) total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    } else {
      currentEnd = Math.max(currentEnd, interval.end);
    }
  }
  if (currentEnd > currentStart) total += currentEnd - currentStart;
  return total / HOUR_MS;
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
        mainEngineRunningHours: 0,
        interruptionHours: 0,
        mainEngineFuel: 0,
        otherFuel: 0,
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
    const runningIntervals: Array<{ start: number; end: number }> = [];
    for (const date of dates) {
      const daily = byDate.get(date);
      if (!daily) continue;
      for (const component of daily.components) {
        if (!['port-main-engine', 'starboard-main-engine'].includes(component.category)) continue;
        if (component.workingHours <= 0 || component.fuel <= 0) continue;
        const hourlyRate = component.fuel / component.workingHours;
        for (const interval of component.intervals) {
          const overlap = overlapHours(interval.start, interval.end, departure, arrival);
          calculatedMainEngineFuel += hourlyRate * overlap;
          if (overlap > 0) {
            runningIntervals.push({
              start: Math.max(Date.parse(interval.start), departure),
              end: Math.min(Date.parse(interval.end), arrival),
            });
          }
        }
      }
    }

    // Other Fuel combines every AE plus all other machines. One-day voyages
    // use the full daily total; multi-day voyages use the available-day average.
    const dailyOtherTotals = dates
      .map((date) => byDate.get(date)?.ancillaryFuel)
      .filter((value): value is number => typeof value === 'number');
    const calculatedOtherFuel = dailyOtherTotals.length === 0
      ? 0
      : dailyOtherTotals.reduce((sum, value) => sum + value, 0) / dailyOtherTotals.length;
    const hasMainOverride = typeof definition.mainEngineFuelOverride === 'number'
      && Number.isFinite(definition.mainEngineFuelOverride)
      && definition.mainEngineFuelOverride >= 0;
    const legacyOtherOverride = definition.otherFuelOverride ?? definition.auxiliaryEngineFuelOverride;
    const hasOtherOverride = typeof legacyOtherOverride === 'number'
      && Number.isFinite(legacyOtherOverride)
      && legacyOtherOverride >= 0;
    const mainEngineFuel = hasMainOverride
      ? definition.mainEngineFuelOverride as number
      : calculatedMainEngineFuel;
    const otherFuel = hasOtherOverride ? legacyOtherOverride as number : calculatedOtherFuel;
    const transitHours = (arrival - departure) / HOUR_MS;
    const mainEngineRunningHours = Math.min(transitHours, mergedOverlapHours(runningIntervals));
    const interruptionHours = Math.max(0, transitHours - mainEngineRunningHours);
    const totalFuel = mainEngineFuel + otherFuel;

    if (mainEngineFuel === 0) warnings.push('No main-engine activity overlaps this voyage window.');
    if (otherFuel === 0) warnings.push('No Other Fuel (AEs / other machines) was found for this voyage.');
    if (interruptionHours > 0) warnings.push(`${rounded(interruptionHours, 2)} h inside the voyage window has no main-engine activity; the voyage was not split automatically.`);
    if (definition.status === 'paused' && !definition.interruptionReason?.trim()) warnings.push('Paused voyage requires an interruption reason.');
    if (definition.source === 'suggested' && definition.confirmed !== true) warnings.push('Suggested voyage window must be confirmed before download.');
    if (definition.distance <= 0) warnings.push('Distance is missing or zero.');

    return {
      ...definition,
      transitHours: rounded(transitHours),
      mainEngineRunningHours: rounded(mainEngineRunningHours),
      interruptionHours: rounded(interruptionHours),
      mainEngineFuel: rounded(mainEngineFuel),
      otherFuel: rounded(otherFuel),
      auxiliaryEngineFuel: rounded(otherFuel),
      totalFuel: rounded(totalFuel),
      averageBurn: transitHours > 0 ? rounded(totalFuel / transitHours) : 0,
      fuelPerNauticalMile: definition.distance > 0 ? rounded(totalFuel / definition.distance) : 0,
      warnings,
    };
  });
}
