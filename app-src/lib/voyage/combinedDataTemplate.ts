'server-only';

import ExcelJS from 'exceljs';
import type { DailyLogRecord } from './types';

const SHEET_NAME = 'Combined Data';

function excelTimeSerial(isoString: string): number {
  // Excel time serial: fraction of a day. 1899-12-30 = day 0.
  const d = new Date(isoString);
  const secondsFromMidnight =
    d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  return secondsFromMidnight / 86400;
}

export async function generateCombinedDataWorkbook(
  dailyLogs: DailyLogRecord[],
  vesselName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AIMF Fleet System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // ── Column widths ──────────────────────────────────────────────────────────
  sheet.columns = [
    { key: 'date',         header: 'Date',                  width: 14 },
    { key: 'component',    header: 'Component',              width: 28 },
    { key: 'usageType',    header: 'Usage Type',             width: 14 },
    { key: 'workingHours', header: 'Working Hours (h)',      width: 18 },
    { key: 'fuel',         header: 'Total Rated Fuel (L)',   width: 22 },
    { key: 'startTime',    header: 'Start Time',             width: 13 },
    { key: 'endTime',      header: 'End Time',               width: 13 },
    { key: 'duration',     header: 'Duration (h)',            width: 14 },
  ];

  // ── Header row styling ─────────────────────────────────────────────────────
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFB0C4DE' } },
    };
  });
  headerRow.height = 28;

  // ── Data rows ──────────────────────────────────────────────────────────────
  const sorted = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));

  let rowIndex = 2;
  const dateFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FA' } };
  const altFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFCFF' } };

  for (const daily of sorted) {
    const dateSerial = new Date(`${daily.date}T00:00:00Z`);
    const dateGroupStart = rowIndex;

    for (const component of daily.components) {
      if (component.intervals.length === 0) {
        // Write a single summary row with no interval times
        const row = sheet.getRow(rowIndex);
        row.getCell(1).value = dateSerial;
        row.getCell(1).numFmt = 'yyyy-mm-dd';
        row.getCell(2).value = component.name;
        row.getCell(3).value = usageTypeLabel(component.category);
        row.getCell(4).value = component.workingHours || 0;
        row.getCell(5).value = component.fuel || 0;
        row.getCell(6).value = '-';
        row.getCell(7).value = '-';
        row.getCell(8).value = component.workingHours || 0;
        applyDataRowStyle(row, rowIndex, dateGroupStart, dateFill, altFill);
        rowIndex += 1;
      } else {
        for (const interval of component.intervals) {
          const row = sheet.getRow(rowIndex);
          row.getCell(1).value = dateSerial;
          row.getCell(1).numFmt = 'yyyy-mm-dd';
          row.getCell(2).value = component.name;
          row.getCell(3).value = usageTypeLabel(component.category);
          // Working hours and fuel are the component totals (shown on every interval row)
          row.getCell(4).value = component.workingHours || 0;
          row.getCell(5).value = component.fuel || 0;
          // Start / end as time serials
          const startSerial = excelTimeSerial(interval.start);
          const endSerial = excelTimeSerial(interval.end);
          row.getCell(6).value = startSerial;
          row.getCell(6).numFmt = 'hh:mm:ss';
          row.getCell(7).value = endSerial;
          row.getCell(7).numFmt = 'hh:mm:ss';
          row.getCell(8).value = interval.durationHours || 0;
          applyDataRowStyle(row, rowIndex, dateGroupStart, dateFill, altFill);
          rowIndex += 1;
        }
      }
    }
  }

  // ── Summary row at the bottom ──────────────────────────────────────────────
  if (sorted.length > 0) {
    const totalRow = sheet.getRow(rowIndex);
    const lastDataRow = rowIndex - 1;
    totalRow.getCell(1).value = `${vesselName.trim().toUpperCase()} — TOTAL`;
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    totalRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    // Merge label across B-E
    sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
    totalRow.getCell(6).value = '';
    totalRow.getCell(7).value = '';
    totalRow.getCell(8).value = {
      formula: `SUM(H2:H${lastDataRow})`,
      result: sorted.reduce(
        (sum, daily) => sum + daily.components.reduce((s, c) => s + (c.workingHours || 0), 0),
        0,
      ),
    };
    totalRow.getCell(8).font = { bold: true };
    totalRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCD9EA' } };
  }

  workbook.calcProperties.fullCalcOnLoad = true;
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function usageTypeLabel(category: string): string {
  if (category === 'port-main-engine' || category === 'starboard-main-engine') return 'Operating';
  if (category === 'auxiliary-engine') return 'Life';
  if (category === 'emergency-engine') return 'Life';
  return 'Operating';
}

function applyDataRowStyle(
  row: ExcelJS.Row,
  rowIndex: number,
  groupStart: number,
  dateFill: ExcelJS.Fill,
  altFill: ExcelJS.Fill,
) {
  const fill = (rowIndex - groupStart) % 2 === 0 ? altFill : dateFill;
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = fill;
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber <= 3 ? 'left' : 'center',
    };
    cell.border = {
      bottom: { style: 'hair', color: { argb: 'FFDCE6F1' } },
    };
  });
  row.height = 18;
}
