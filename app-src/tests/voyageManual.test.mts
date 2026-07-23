import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateVoyages } from '../lib/voyage/calculations.ts';
import {
  dailyInDateRange,
  manualInputToDailyLog,
  mergeDailyLogs,
  validateDateRange,
  voyageInDateRange,
} from '../lib/voyage/manual.ts';
import type { ManualDailyLogInput, VoyageDefinition } from '../lib/voyage/types.ts';
import { cleanVesselName, vesselFileStem } from '../lib/voyage/vessel.ts';

function manual(date: string, id = date): ManualDailyLogInput {
  return {
    id,
    date,
    location: 'Perez',
    activity: 'Transit',
    portHours: 4,
    starboardHours: 4,
    mainEngineFuel: 2_000,
    auxiliaryEngineFuel: 300,
    otherFuel: 125,
  };
}

function voyage(overrides: Partial<VoyageDefinition> = {}): VoyageDefinition {
  return {
    id: 'V1',
    cycle: 1,
    displayCycle: true,
    from: 'Perez',
    to: 'Botolan',
    departure: '2026-05-29T20:00:00.000Z',
    arrival: '2026-05-30T04:00:00.000Z',
    distance: 100,
    averageSpeed: 8,
    ...overrides,
  };
}

test('manual daily values populate daily totals and all-AE fuel', () => {
  const daily = manualInputToDailyLog(manual('2026-05-29'), 'Harbor Master 2');
  assert.equal(daily.source, 'manual');
  assert.equal(daily.vesselName, 'Harbor Master 2');
  assert.equal(daily.auxiliaryEngineFuel, 300);
  assert.equal(daily.ancillaryFuel, 425);
  assert.equal(daily.totalFuel, 2_425);
  assert.equal(daily.components.length, 0);
  assert.match(daily.warnings[0], /no engine operating intervals/i);
});

test('vessel names are normalized for titles and safe download filenames', () => {
  assert.equal(cleanVesselName('  Harbor   Master 2  '), 'Harbor Master 2');
  assert.equal(vesselFileStem('Harbor Master #2'), 'Harbor-Master-2');
});

test('manual and Excel records cannot silently overwrite the same date', () => {
  const uploaded = { ...manualInputToDailyLog(manual('2026-05-29', 'uploaded')), source: 'excel' as const };
  assert.throws(
    () => mergeDailyLogs([uploaded], [manual('2026-05-29')]),
    /more than one daily entry/i,
  );
});

test('date range is inclusive for daily logs and includes overlapping voyages', () => {
  const daily = manualInputToDailyLog(manual('2026-06-01'));
  assert.equal(validateDateRange('2026-06-01', '2026-06-30'), true);
  assert.equal(validateDateRange('2026-06-30', '2026-06-01'), false);
  assert.equal(dailyInDateRange(daily, '2026-06-01', '2026-06-01'), true);
  assert.equal(voyageInDateRange(voyage(), '2026-05-30', '2026-05-30'), true);
  assert.equal(voyageInDateRange(voyage(), '2026-05-31', '2026-06-30'), false);
});

test('manual voyage fuel overrides replace calculated ME and all-AE values', () => {
  const logs = [
    manualInputToDailyLog(manual('2026-05-29')),
    manualInputToDailyLog(manual('2026-05-30')),
  ];
  const [result] = calculateVoyages(logs, [voyage({
    mainEngineFuelOverride: 1_250.5,
    auxiliaryEngineFuelOverride: 475.25,
  })]);

  assert.equal(result.mainEngineFuel, 1_250.5);
  assert.equal(result.auxiliaryEngineFuel, 475.25);
  assert.equal(result.totalFuel, 1_725.75);
});
