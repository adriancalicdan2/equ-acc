import assert from 'node:assert/strict';
import test from 'node:test';

import * as XLSX from 'xlsx';

import { calculateVoyages } from '../lib/voyage/calculations.ts';
import { parseWorkTimeWorkbook, validateSpreadsheetUpload } from '../lib/voyage/parser.ts';
import type { DailyLogRecord, VoyageDefinition } from '../lib/voyage/types.ts';

function legacyWorkbook(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'WorkTimeStatistics');
  return new Uint8Array(XLSX.write(workbook, { bookType: 'biff8', type: 'array' }));
}

test('legacy parser tolerates variable repeated rows and counts each component total once', () => {
  const rows = [
    ['DREDGE MASTER 5 - 20260529'],
    [],
    ['Component', 'Working Hours', 'Total Rated Fuel Consumption', 'Start Time', 'End Time', 'Duration'],
    ['Port ME', 3.54, 1093.71, '01:00', '02:30', 1.5],
    ['Port ME', 3.54, 1093.71, '02:30', '04:32:24', 2.04],
    ['Starboard ME', 3.55, 1098.43, '01:00', '02:30', 1.5],
    ['Starboard ME', 3.55, 1098.43, '02:30', '04:33:00', 2.05],
    ['AE 1', 300, 300, '00:00', '12:00', 12],
    ['AE 1', 300, 300, '12:00', '23:59', 12],
    ['AE #2', 240.48, 240.48, '00:00', '23:59', 24],
    ['Emergency Engin', 100, 100, '00:00', '01:00', 1],
    ['Conveyor', 583.32, 583.32, '04:00', '05:00', 1],
  ];

  const daily = parseWorkTimeWorkbook(
    '20260529_DREDGE+MASTER+5_WorkTimeStatistics.xls',
    legacyWorkbook(rows),
  );

  assert.equal(daily.date, '2026-05-29');
  assert.equal(daily.vesselName, 'DREDGE MASTER 5');
  assert.equal(daily.components.find((component) => component.name === 'Port ME')?.occurrences, 2);
  assert.equal(daily.components.find((component) => component.name === 'AE #1')?.occurrences, 2);
  assert.equal(daily.mainEngineFuel, 2192.14);
  assert.equal(daily.auxiliaryEngineFuel, 540.48);
  assert.equal(daily.ancillaryFuel, 1223.8);
  assert.equal(daily.totalFuel, 3415.94);
});

test('upload validation rejects renamed non-spreadsheet data', () => {
  assert.throws(
    () => validateSpreadsheetUpload('fake.xls', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
    /contents do not match/i,
  );
});

function dailyRecord(
  date: string,
  aeFuel: number,
  ancillaryFuel: number,
  mainFuel: number,
): DailyLogRecord {
  return {
    source: 'excel',
    fileName: `${date}.xls`,
    vesselName: 'Test Vessel',
    date,
    location: '',
    activity: '',
    portHours: 10,
    starboardHours: 8,
    mainEngineFuel: mainFuel,
    auxiliaryEngineFuel: aeFuel,
    ancillaryFuel,
    totalFuel: mainFuel + ancillaryFuel,
    components: [
      {
        name: 'Port ME',
        category: 'port-main-engine',
        workingHours: 10,
        fuel: 1_000,
        occurrences: 1,
        intervals: [{
          start: `${date}T00:00:00.000Z`,
          end: `${date}T10:00:00.000Z`,
          durationHours: 10,
        }],
      },
      {
        name: 'Starboard ME',
        category: 'starboard-main-engine',
        workingHours: 8,
        fuel: 800,
        occurrences: 1,
        intervals: [{
          start: `${date}T02:00:00.000Z`,
          end: `${date}T10:00:00.000Z`,
          durationHours: 8,
        }],
      },
      {
        name: 'Emergency Engine',
        category: 'emergency-engine',
        workingHours: 1,
        fuel: Math.max(0, ancillaryFuel - aeFuel),
        occurrences: 1,
        intervals: [],
      },
    ],
    warnings: [],
  };
}

function voyage(
  id: string,
  departure: string,
  arrival: string,
): VoyageDefinition {
  return {
    id,
    cycle: 1,
    displayCycle: true,
    from: 'A',
    to: 'B',
    departure,
    arrival,
    distance: 100,
    averageSpeed: 8,
  };
}

test('voyages use all AE units and exclude emergency/other fuel', () => {
  const logs = [
    dailyRecord('2026-05-29', 500, 650, 1_800),
    dailyRecord('2026-05-30', 350, 900, 1_800),
  ];
  const results = calculateVoyages(logs, [
    voyage('single', '2026-05-29T03:00:00.000Z', '2026-05-29T05:00:00.000Z'),
    voyage('multi', '2026-05-29T03:00:00.000Z', '2026-05-30T05:00:00.000Z'),
  ]);

  assert.equal(results[0].mainEngineFuel, 400);
  assert.equal(results[0].auxiliaryEngineFuel, 500);
  assert.equal(results[0].totalFuel, 900);
  assert.equal(results[1].mainEngineFuel, 2_200);
  assert.equal(results[1].auxiliaryEngineFuel, 425);
  assert.equal(results[1].totalFuel, 2_625);
});
