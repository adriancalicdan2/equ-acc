import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyEquipmentSerial, nextEmptyIndex, nextFloaterIndex } from '../lib/equipmentScanner.ts';

test('serial prefixes route to the correct equipment section', () => {
  assert.equal(classifyEquipmentSerial('SP100123')?.category, 'capacitance');
  assert.equal(classifyEquipmentSerial('S200123')?.category, 'floater');
  assert.equal(classifyEquipmentSerial('NR00123')?.category, 'network');
  assert.equal(classifyEquipmentSerial('SD00123')?.category, 'engine');
  assert.equal(classifyEquipmentSerial('Z00123')?.category, 'solar');
});

test('classification trims surrounding whitespace and ignores prefix casing', () => {
  assert.deepEqual(classifyEquipmentSerial('  nr-123  '), {
    serial: 'nr-123',
    category: 'network',
    label: 'Wireless Network Transmitter',
  });
});

test('empty and unknown serial numbers are rejected', () => {
  assert.equal(classifyEquipmentSerial(''), null);
  assert.equal(classifyEquipmentSerial('UNKNOWN-1'), null);
});

test('standard equipment uses the first empty slot before expanding quantity', () => {
  assert.deepEqual(nextEmptyIndex(['SP1001', '', 'SP1003'], 3), { index: 1, expand: false });
  assert.deepEqual(nextEmptyIndex(['SP1001'], 1), { index: 1, expand: true });
});

test('floater AM and AR values use their respective side of the tank pair', () => {
  const values = ['S2-AM-1', '', '', 'S2-AR-2'];
  assert.deepEqual(nextFloaterIndex(values, 2, 'AM'), { index: 2, expand: false });
  assert.deepEqual(nextFloaterIndex(values, 2, 'AR'), { index: 1, expand: false });
});

test('floater quantity expands only when the selected side has no empty slot', () => {
  assert.deepEqual(nextFloaterIndex(['S2-AM-1', ''], 1, 'AM'), { index: 2, expand: true });
  assert.deepEqual(nextFloaterIndex(['', 'S2-AR-1'], 1, 'AR'), { index: 3, expand: true });
});
