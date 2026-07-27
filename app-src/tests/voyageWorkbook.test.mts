import assert from 'node:assert/strict';
import test from 'node:test';

import ExcelJS from 'exceljs';
import { verifyVoyageSummaryPopulation } from '../lib/voyage/workbookValidation.ts';

async function workbookBuffer(populated: boolean) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Voyage Summary');
  sheet.getCell('A1').value = 'TEST VESSEL — 1 VOYAGES';
  if (populated) {
    sheet.getCell('D5').value = new Date('2026-07-01T01:00:00.000Z');
    sheet.getCell('E5').value = new Date('2026-07-01T09:00:00.000Z');
  }
  sheet.getCell('A6').value = 'TOTAL / OVERALL';
  return workbook.xlsx.writeBuffer();
}

test('generated workbook guard accepts a populated Voyage Summary', async () => {
  const result = await verifyVoyageSummaryPopulation(await workbookBuffer(true), 1);
  assert.deepEqual(result, { voyageCount: 1, totalRow: 6 });
});

test('generated workbook guard rejects an empty Voyage Summary', async () => {
  await assert.rejects(
    verifyVoyageSummaryPopulation(await workbookBuffer(false), 1),
    /Voyage Summary row 5 was not populated correctly/,
  );
});
