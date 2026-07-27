import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendDailyLogHistory,
  duplicateDailyLogDates,
  vesselHistoryId,
} from '../lib/voyage/history.ts';
import { manualInputToDailyLog } from '../lib/voyage/manual.ts';

function daily(date: string) {
  return manualInputToDailyLog({
    id: date,
    date,
    location: 'Perez',
    activity: 'Transit',
    portHours: 4,
    starboardHours: 4,
    mainEngineFuel: 2_000,
    auxiliaryEngineFuel: 300,
    otherFuel: 125,
  }, 'Dredge Master 5');
}

test('vessel history IDs are stable across casing and spacing', () => {
  assert.equal(
    vesselHistoryId(' Dredge   Master 5 '),
    vesselHistoryId('dredge master 5'),
  );
  assert.notEqual(vesselHistoryId('Dredge Master 5'), vesselHistoryId('Dredge-Master 6'));
});

test('later months append without overwriting existing saved dates', () => {
  const existingFebruary = { ...daily('2026-02-28'), activity: 'Saved February activity' };
  const result = appendDailyLogHistory(
    [daily('2026-01-25'), existingFebruary],
    [{ ...daily('2026-02-28'), activity: 'Duplicate should be ignored' }, daily('2026-03-01')],
    'Dredge Master 5',
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
