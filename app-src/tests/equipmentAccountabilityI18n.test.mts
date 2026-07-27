import assert from 'node:assert/strict';
import test from 'node:test';

import {
  equipmentAccountabilityCopy,
  equipmentChangeSummaryForLanguage,
  equipmentStatusLabel,
  equipmentValidationMessage,
  isEquipmentLanguage,
} from '../lib/equipment/accountabilityI18n.ts';

test('equipment accountability supports only the configured languages', () => {
  assert.equal(isEquipmentLanguage('en'), true);
  assert.equal(isEquipmentLanguage('zh'), true);
  assert.equal(isEquipmentLanguage('fil'), false);
});

test('Chinese mode translates core controls, validation, and statuses', () => {
  assert.equal(equipmentAccountabilityCopy.zh.heroTitle, '设备责任管理报告');
  assert.equal(equipmentAccountabilityCopy.zh.archiveVessel, '归档船舶');
  assert.equal(
    equipmentValidationMessage('zh', 'Select at least one copy type'),
    '请至少选择一种副本',
  );
  assert.equal(equipmentStatusLabel('zh', 'fully_charged'), '已充满');
});

test('inventory-impact summaries preserve serial numbers in both languages', () => {
  const changes = [{
    itemId: 'nr' as const,
    itemName: 'NR (Network Transmitter)',
    added: ['NR-200'],
    removed: ['NR-100'],
  }];

  assert.match(equipmentChangeSummaryForLanguage('en', changes), /NR-200/);
  assert.match(equipmentChangeSummaryForLanguage('zh', changes), /新增 1 个/);
  assert.match(equipmentChangeSummaryForLanguage('zh', changes), /NR-100/);
});
