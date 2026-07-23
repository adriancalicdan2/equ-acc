import * as XLSX from 'xlsx';
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs';
import type {
  ComponentCategory,
  ComponentSummary,
  DailyLogRecord,
  OperatingInterval,
} from './types';

XLSX.set_cptable(cpexcel);

const XLS_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

const MAX_FILE_BYTES = 2 * 1024 * 1024;

type CellValue = string | number | boolean | Date | null | undefined;

interface HeaderIndexes {
  component: number;
  workingHours: number;
  fuel: number;
  startTime: number;
  endTime: number;
  duration: number;
}

function compact(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizedLabel(value: unknown) {
  return compact(value).toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
}

function asNumber(value: CellValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return 0;
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseReportDate(fileName: string, title: unknown) {
  const candidate = `${fileName} ${compact(title)}`;
  const match = candidate.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?:\D|$)/);
  if (!match) throw new Error('Could not determine the report date from the filename or title.');
  const [, year, month, day] = match;
  const result = `${year}-${month}-${day}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid report date: ${result}`);
  }
  return result;
}

function parseVesselName(fileName: string, title: unknown) {
  const candidate = (value: string) => compact(value
    .replace(/\.(?:xls|xlsx)$/i, '')
    .replace(/[+_]+/g, ' ')
    .replace(/[-â€“â€”]+/g, ' ')
    .replace(/\b20\d{6}\b/g, ' ')
    .replace(/\bwork\s*time\s*statistics\b/gi, ' '));
  return candidate(compact(title)) || candidate(fileName);
}

function findHeader(rows: CellValue[][]): { rowIndex: number; indexes: HeaderIndexes } {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const labels = rows[rowIndex].map(normalizedLabel);
    const component = labels.findIndex((value) => value === 'component');
    const workingHours = labels.findIndex((value) => value.includes('working hours'));
    const fuel = labels.findIndex((value) => value.includes('total rated fuel'));
    const startTime = labels.findIndex((value) => value.includes('start time'));
    const endTime = labels.findIndex((value) => value.includes('end time'));
    const duration = labels.findIndex((value) => value.includes('duration'));
    if ([component, workingHours, fuel, startTime, endTime, duration].every((index) => index >= 0)) {
      return { rowIndex, indexes: { component, workingHours, fuel, startTime, endTime, duration } };
    }
  }
  throw new Error('Required WorkTimeStatistics headers were not found.');
}

function normalizeComponentName(rawName: unknown) {
  const name = compact(rawName)
    .replace(/\bengin\b/gi, 'Engine')
    .replace(/\s*#\s*/g, ' #')
    .replace(/^AE\s*(\d+)$/i, 'AE #$1');
  const label = normalizedLabel(name);
  if (/^port me$/.test(label) || label.includes('port main engine')) return 'Port ME';
  if (/^starboard me$/.test(label) || label.includes('starboard main engine')) return 'Starboard ME';
  const ae = label.match(/^(?:ae|auxiliary engine)\s*#?\s*(\d+)/);
  if (ae) return `AE #${ae[1]}`;
  if (label.includes('emergency engine')) return 'Emergency Engine';
  return name;
}

function componentCategory(name: string): ComponentCategory {
  if (name === 'Port ME') return 'port-main-engine';
  if (name === 'Starboard ME') return 'starboard-main-engine';
  if (/^AE #\d+$/i.test(name)) return 'auxiliary-engine';
  if (/emergency engine/i.test(name)) return 'emergency-engine';
  return 'other';
}

function timeParts(value: CellValue): [number, number, number] | null {
  if (value instanceof Date) {
    return [value.getHours(), value.getMinutes(), value.getSeconds()];
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const seconds = Math.round((((value % 1) + 1) % 1) * 86_400) % 86_400;
    return [Math.floor(seconds / 3_600), Math.floor((seconds % 3_600) / 60), seconds % 60];
  }
  const match = compact(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const result: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  return result[0] < 24 && result[1] < 60 && result[2] < 60 ? result : null;
}

function intervalForDate(
  date: string,
  startValue: CellValue,
  endValue: CellValue,
  durationValue: CellValue,
): OperatingInterval | null {
  const start = timeParts(startValue);
  const end = timeParts(endValue);
  if (!start || !end) return null;
  const [year, month, day] = date.split('-').map(Number);
  const startMs = Date.UTC(year, month - 1, day, ...start);
  let endMs = Date.UTC(year, month - 1, day, ...end);
  const reportedDuration = asNumber(durationValue);
  if (endMs < startMs || (endMs === startMs && reportedDuration > 0)) endMs += 86_400_000;
  const computedDuration = (endMs - startMs) / 3_600_000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    durationHours: reportedDuration > 0 ? reportedDuration : computedDuration,
  };
}

function signatureMatches(bytes: Uint8Array, extension: string) {
  const startsWith = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (extension === '.xls') return startsWith(XLS_SIGNATURE);
  if (extension === '.xlsx') return ZIP_SIGNATURES.some(startsWith);
  return false;
}

export function validateSpreadsheetUpload(fileName: string, bytes: Uint8Array) {
  const extension = fileName.toLowerCase().match(/\.(xls|xlsx)$/)?.[0] ?? '';
  if (!extension) throw new Error('Only .xls and .xlsx files are supported.');
  if (bytes.byteLength === 0) throw new Error('The uploaded workbook is empty.');
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('Each workbook must be 2 MB or smaller.');
  if (!signatureMatches(bytes, extension)) {
    throw new Error(`The file contents do not match the ${extension} format.`);
  }
}

export function parseWorkTimeWorkbook(fileName: string, bytes: Uint8Array): DailyLogRecord {
  validateSpreadsheetUpload(fileName, bytes);
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    bookVBA: false,
    WTF: false,
  });
  const sheetName = workbook.SheetNames.find((name) => /work\s*time\s*statistics/i.test(name))
    ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook does not contain a worksheet.');
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  if (rows.length < 3) throw new Error('The workbook does not contain enough data rows.');

  const date = parseReportDate(fileName, rows[0]?.[0]);
  const { rowIndex, indexes } = findHeader(rows);
  const warnings: string[] = [];
  const grouped = new Map<string, {
    name: string;
    category: ComponentCategory;
    hours: number[];
    fuel: number[];
    intervals: OperatingInterval[];
    occurrences: number;
  }>();

  for (const row of rows.slice(rowIndex + 1)) {
    const rawName = compact(row[indexes.component]);
    if (!rawName || normalizedLabel(rawName) === 'total work hours') continue;
    const name = normalizeComponentName(rawName);
    const key = name.toLowerCase();
    const entry = grouped.get(key) ?? {
      name,
      category: componentCategory(name),
      hours: [],
      fuel: [],
      intervals: [],
      occurrences: 0,
    };
    entry.occurrences += 1;
    entry.hours.push(asNumber(row[indexes.workingHours]));
    entry.fuel.push(asNumber(row[indexes.fuel]));
    const interval = intervalForDate(
      date,
      row[indexes.startTime],
      row[indexes.endTime],
      row[indexes.duration],
    );
    if (interval) entry.intervals.push(interval);
    grouped.set(key, entry);
  }

  const components: ComponentSummary[] = [...grouped.values()].map((entry) => {
    const hours = entry.hours[0] ?? 0;
    const fuel = entry.fuel[0] ?? 0;
    if (entry.hours.some((value) => Math.abs(value - hours) > 0.01)) {
      warnings.push(`${entry.name} has conflicting repeated working-hour totals.`);
    }
    if (entry.fuel.some((value) => Math.abs(value - fuel) > 0.01)) {
      warnings.push(`${entry.name} has conflicting repeated fuel totals.`);
    }
    const intervalHours = entry.intervals.reduce((sum, interval) => sum + interval.durationHours, 0);
    if (hours > 0 && entry.intervals.length > 0 && Math.abs(intervalHours - hours) > 0.15) {
      warnings.push(
        `${entry.name} interval durations (${intervalHours.toFixed(2)} h) do not reconcile with ${hours.toFixed(2)} working hours.`,
      );
    }
    return {
      name: entry.name,
      category: entry.category,
      workingHours: hours,
      fuel,
      occurrences: entry.occurrences,
      intervals: entry.intervals,
    };
  });

  const port = components.find((component) => component.category === 'port-main-engine');
  const starboard = components.find((component) => component.category === 'starboard-main-engine');
  if (!port) warnings.push('Port ME was not found.');
  if (!starboard) warnings.push('Starboard ME was not found.');

  const mainEngineFuel = rounded((port?.fuel ?? 0) + (starboard?.fuel ?? 0));
  const auxiliaryEngineFuel = rounded(components
    .filter((component) => component.category === 'auxiliary-engine')
    .reduce((sum, component) => sum + component.fuel, 0));
  const ancillaryFuel = rounded(components
    .filter((component) => !['port-main-engine', 'starboard-main-engine'].includes(component.category))
    .reduce((sum, component) => sum + component.fuel, 0));

  return {
    source: 'excel',
    fileName,
    vesselName: parseVesselName(fileName, rows[0]?.[0]),
    date,
    location: '',
    activity: '',
    portHours: port?.workingHours ?? 0,
    starboardHours: starboard?.workingHours ?? 0,
    mainEngineFuel,
    auxiliaryEngineFuel,
    ancillaryFuel,
    totalFuel: rounded(mainEngineFuel + ancillaryFuel),
    components,
    warnings,
  };
}
