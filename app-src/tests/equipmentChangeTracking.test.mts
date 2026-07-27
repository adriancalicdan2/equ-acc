import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffEquipmentReports,
  equipmentAssignments,
  equipmentChangeSummary,
} from '../lib/equipment/changeTracking.ts';

function report(overrides: Record<string, unknown> = {}) {
  return {
    solar: { serialNumber: 'SOL-1' },
    network: { serialNumber: 'NR-1' },
    engine: { serialNumber: 'SD-1, SD-2' },
    flsFloater: { serialNumber: 'AM-1, AR-1, AM-2, AR-2' },
    flsCapacitance: { serialNumber: 'CAP-1' },
    ...overrides,
  };
}

test('equipment assignments use the same inventory mapping as deployed counts', () => {
  const assignments = equipmentAssignments(report());
  assert.deepEqual(assignments.terminal, ['SOL-1']);
  assert.deepEqual(assignments['bracket-terminal'], ['SOL-1']);
  assert.deepEqual(assignments['fls-floater-m'], ['AM-1', 'AM-2']);
  assert.deepEqual(assignments['fls-floater-std'], ['AR-1', 'AR-2']);
  assert.deepEqual(assignments['bracket-sp2'], ['AM-1', 'AR-1', 'AM-2', 'AR-2']);
});

test('serial-number changes produce deploy and return movements', () => {
  const before = report();
  const after = report({
    network: { serialNumber: 'NR-2' },
    engine: { serialNumber: 'SD-1' },
  });
  const changes = diffEquipmentReports(before, after);
  const nr = changes.find((change) => change.itemId === 'nr');
  const nrBracket = changes.find((change) => change.itemId === 'bracket-nr');
  const sd = changes.find((change) => change.itemId === 'sd');

  assert.deepEqual(nr?.added, ['NR-2']);
  assert.deepEqual(nr?.removed, ['NR-1']);
  assert.deepEqual(nrBracket?.added, ['NR-2']);
  assert.deepEqual(nrBracket?.removed, ['NR-1']);
  assert.deepEqual(sd?.added, []);
  assert.deepEqual(sd?.removed, ['SD-2']);
  assert.match(equipmentChangeSummary(changes), /NR \(Network Transmitter\)/);
});

test('case-only serial edits do not create false inventory movements', () => {
  const changes = diffEquipmentReports(
    report({ network: { serialNumber: 'NR-1' } }),
    report({ network: { serialNumber: 'nr-1' } }),
  );
  assert.equal(changes.some((change) => change.itemId === 'nr'), false);
});
