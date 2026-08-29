import type { DailyLogRecord, OperatingInterval, VoyageDefinition } from './types';

const HOUR_MS = 3_600_000;
const SUGGESTION_GAP_HOURS = 2;
const MIN_SUGGESTED_HOURS = 10;

interface TimedInterval {
  start: number;
  end: number;
}

function mainEngineIntervals(dailyLogs: DailyLogRecord[]) {
  const intervals: TimedInterval[] = [];
  for (const daily of dailyLogs) {
    for (const component of daily.components) {
      if (!['port-main-engine', 'starboard-main-engine'].includes(component.category)) continue;
      for (const interval of component.intervals) {
        const start = Date.parse(interval.start);
        const end = Date.parse(interval.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) intervals.push({ start, end });
      }
    }
  }
  return intervals.sort((a, b) => a.start - b.start);
}

function groupedActivityDefinitions(dailyLogs: DailyLogRecord[]) {
  const grouped = new Map<string, OperatingInterval[]>();
  for (const daily of dailyLogs) {
    const match = daily.activity.match(/\btransit\s*\(?\s*(V\d+)\s*\)?/i);
    if (!match) continue;
    const id = match[1].toUpperCase();
    const intervals = daily.components
      .filter((component) => ['port-main-engine', 'starboard-main-engine'].includes(component.category))
      .flatMap((component) => component.intervals);
    grouped.set(id, [...(grouped.get(id) ?? []), ...intervals]);
  }

  return [...grouped.entries()]
    .map(([id, intervals]) => {
      const times = intervals
        .flatMap((interval) => [Date.parse(interval.start), Date.parse(interval.end)])
        .filter(Number.isFinite);
      if (times.length < 2) return null;
      return { id, start: Math.min(...times), end: Math.max(...times) };
    })
    .filter((value): value is { id: string; start: number; end: number } => value != null)
    .sort((a, b) => a.start - b.start);
}

export function suggestVoyageDefinitions(dailyLogs: DailyLogRecord[]): VoyageDefinition[] {
  const marked = groupedActivityDefinitions(dailyLogs);
  const clusters = marked.length > 0 ? marked : (() => {
    const intervals = mainEngineIntervals(dailyLogs);
    const result: Array<{ id: string; start: number; end: number }> = [];
    for (const interval of intervals) {
      const last = result.at(-1);
      if (!last || interval.start - last.end > SUGGESTION_GAP_HOURS * HOUR_MS) {
        result.push({ id: `V${result.length + 1}`, ...interval });
      } else {
        last.end = Math.max(last.end, interval.end);
      }
    }
    return result.filter((cluster) => cluster.end - cluster.start >= MIN_SUGGESTED_HOURS * HOUR_MS);
  })();

  return clusters.map((cluster, index) => ({
    id: cluster.id,
    cycle: Math.ceil((index + 1) / 2),
    displayCycle: index % 2 === 0,
    from: '',
    to: '',
    departure: new Date(cluster.start).toISOString(),
    arrival: new Date(cluster.end).toISOString(),
    distance: 0,
    averageSpeed: 0,
    status: 'planned',
    source: 'suggested',
    confirmed: false,
    interruptionReason: '',
    mainEngineFuelOverride: null,
    otherFuelOverride: null,
  }));
}
