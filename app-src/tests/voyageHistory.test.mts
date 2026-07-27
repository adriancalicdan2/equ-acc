import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendDailyLogHistory,
  duplicateDailyLogDates,
  normalizeVesselVoyageDefinitions,
  replaceDailyLogHistory,
  vesselHistoryId,
} from '../lib/voyage/history.ts';
import { manualInputToDailyLog } from '../lib/voyage/manual.ts';

function daily(date: string) {
  return manualInputToDailyLog({
    id: date,
    date,
    location: 'Port Alpha',
    activity: 'Transit',
    portHours: 4,
    starboardHours: 4,
    mainEngineFuel: 2_000,
    auxiliaryEngineFuel: 300,
    otherFuel: 125,
  }, 'Harbor Master 2');
}

test('vessel history IDs are stable across casing and spacing', () => {
  assert.equal(
    vesselHistoryId(' Harbor   Master 2 '),
    vesselHistoryId('harbor master 2'),
  );
  assert.notEqual(vesselHistoryId('Harbor Master 2'), vesselHistoryId('Harbor-Master 3'));
});

test('later months append without overwriting existing saved dates', () => {
  const existingFebruary = { ...daily('2026-02-28'), activity: 'Saved February activity' };
  const result = appendDailyLogHistory(
    [daily('2026-01-25'), existingFebruary],
    [{ ...daily('2026-02-28'), activity: 'Duplicate should be ignored' }, daily('2026-03-01')],
    'Harbor Master 2',
  );
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.dailyLogs.map((entry) => entry.date), [
    '2026-01-25',
    '2026-02-28',
    '2026-03-01',
  ]);
  assert.equal(result.dailyLogs[1].activity, 'Saved February activity');
});

test('saved history detects only overlapping incoming dates', () => {
  const duplicates = duplicateDailyLogDates(
    [daily('2026-01-25'), daily('2026-02-28')],
    [daily('2026-02-28'), daily('2026-03-01')],
  );
  assert.deepEqual(duplicates, ['2026-02-28']);
});

test('legacy template voyages are removed and vessel voyages restart at V1', () => {
  const base = {
    cycle: 18,
    displayCycle: true,
    from: '',
    to: '',
    distance: 0,
    averageSpeed: 0,
    status: 'planned' as const,
    confirmed: false,
    interruptionReason: '',
  };
  const result = normalizeVesselVoyageDefinitions([
    { ...base, id: 'V1', departure: '2026-05-29T00:00:00.000Z', arrival: '2026-05-30T00:00:00.000Z', source: 'template' },
    { ...base, id: 'V35', departure: '2026-04-01T00:00:00.000Z', arrival: '2026-04-01T23:59:59.000Z', source: 'manual' },
    { ...base, id: 'V36', departure: '2026-01-25T00:00:00.000Z', arrival: '2026-01-25T23:59:59.000Z', source: 'manual' },
  ]);

  assert.equal(result.removedLegacyCount, 1);
  assert.deepEqual(result.definitions.map(({ id, cycle, displayCycle }) => ({ id, cycle, displayCycle })), [
    { id: 'V1', cycle: 1, displayCycle: true },
    { id: 'V2', cycle: 1, displayCycle: false },
  ]);
  assert.equal(result.definitions[0].departure, '2026-01-25T00:00:00.000Z');
});

test('replacement saves selected date deletions without restoring old rows', () => {
  const result = replaceDailyLogHistory(
    [daily('2026-01-25'), daily('2026-02-28'), daily('2026-03-01')],
    [daily('2026-01-25'), daily('2026-03-01'), daily('2026-04-01')],
    'Harbor Master 2',
  );

  assert.deepEqual(result.dailyLogs.map((entry) => entry.date), [
    '2026-01-25',
    '2026-03-01',
    '2026-04-01',
  ]);
  assert.equal(result.added, 1);
  assert.equal(result.deleted, 1);

  const cleared = replaceDailyLogHistory(result.dailyLogs, [], 'Harbor Master 2');
  assert.deepEqual(cleared.dailyLogs, []);
  assert.equal(cleared.deleted, 3);
});
