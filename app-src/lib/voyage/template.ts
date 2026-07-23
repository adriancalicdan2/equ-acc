import 'server-only';

import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DailyLogRecord, VoyageDefinition, VoyageResult } from './types';

const TEMPLATE_NAME = 'Vessel_Daily_Logs_&Voyage.xlsx';

const CHART_PARTS = [
  'xl/drawings/drawing1.xml',
  'xl/drawings/drawing2.xml',
  'xl/drawings/_rels/drawing1.xml.rels',
  'xl/drawings/_rels/drawing2.xml.rels',
  'xl/charts/chart1.xml',
  'xl/charts/chart2.xml',
  'xl/charts/style1.xml',
  'xl/charts/colors1.xml',
] as const;

const CHART_CONTENT_TYPES = [
  ['/xl/drawings/drawing1.xml', 'application/vnd.openxmlformats-officedocument.drawing+xml'],
  ['/xl/drawings/drawing2.xml', 'application/vnd.openxmlformats-officedocument.drawing+xml'],
  ['/xl/charts/chart1.xml', 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'],
  ['/xl/charts/chart2.xml', 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'],
  ['/xl/charts/style1.xml', 'application/vnd.ms-office.chartstyle+xml'],
  ['/xl/charts/colors1.xml', 'application/vnd.ms-office.chartcolorstyle+xml'],
] as const;

async function requiredZipText(zip: JSZip, name: string) {
  const file = zip.file(name);
  if (!file) throw new Error(`The workbook package is missing ${name}.`);
  return file.async('string');
}

function addDrawingReference(worksheetXml: string, relationshipId: string) {
  if (/<drawing\s/.test(worksheetXml)) return worksheetXml;
  return worksheetXml.replace('</worksheet>', `<drawing r:id="${relationshipId}"/></worksheet>`);
}

function updateChartRange(
  chartXml: string,
  sheetName: string,
  column: string,
  endRow: number,
) {
  const expression = new RegExp(
    `('${sheetName}'!\\$${column}\\$5:\\$${column}\\$)\\d+`,
    'g',
  );
  return chartXml.replace(expression, `$1${Math.max(5, endRow)}`);
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function stringChartCache(values: string[]) {
  const points = values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXml(value)}</c:v></c:pt>`)
    .join('');
  return `<c:strCache><c:ptCount val="${values.length}"/>${points}</c:strCache>`;
}

function numberChartCache(values: number[]) {
  const points = values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`)
    .join('');
  return `<c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="${values.length}"/>${points}</c:numCache>`;
}

function refreshDailyChartSeries(
  chartXml: string,
  valueColumn: 'F' | 'G',
  name: string,
  categories: string[],
  values: number[],
) {
  return chartXml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (series) => {
    if (!series.includes(`!$${valueColumn}$5:`)) return series;

    const seriesName = `<c:tx><c:v>${escapeXml(name)}</c:v></c:tx>`;
    const namedSeries = /<c:tx>[\s\S]*?<\/c:tx>/.test(series)
      ? series.replace(/<c:tx>[\s\S]*?<\/c:tx>/, seriesName)
      : series.replace(/(<c:order val="\d+"\/>)/, `$1${seriesName}`);

    return namedSeries
      .replace(/<c:strCache>[\s\S]*?<\/c:strCache>/, stringChartCache(categories))
      .replace(/<c:numCache>[\s\S]*?<\/c:numCache>/, numberChartCache(values));
  });
}

async function preserveTemplateCharts(
  generated: ExcelJS.Buffer,
  voyageCount: number,
  dailyLogs: DailyLogRecord[],
) {
  const [templateBytes, outputZip] = await Promise.all([
    readFile(templatePath()),
    JSZip.loadAsync(generated),
  ]);
  const templateZip = await JSZip.loadAsync(templateBytes);

  for (const name of CHART_PARTS) {
    const sourcePart = templateZip.file(name);
    if (!sourcePart) throw new Error(`The vessel report template is missing chart part ${name}.`);
    outputZip.file(name, await sourcePart.async('uint8array'));
  }

  let voyageChart = await requiredZipText(templateZip, 'xl/charts/chart1.xml');
  for (const column of ['A', 'I']) {
    voyageChart = updateChartRange(voyageChart, 'Voyage Summary', column, 4 + voyageCount);
  }
  outputZip.file('xl/charts/chart1.xml', voyageChart);

  let dailyChart = await requiredZipText(templateZip, 'xl/charts/chart2.xml');
  for (const column of ['A', 'F', 'G']) {
    dailyChart = updateChartRange(dailyChart, 'Daily log', column, 4 + dailyLogs.length);
  }
  const dailyCategories = dailyLogs.map((daily) => formatDailyDate(daily.date));
  dailyChart = refreshDailyChartSeries(
    dailyChart,
    'F',
    'Main Engines',
    dailyCategories,
    dailyLogs.map((daily) => daily.mainEngineFuel),
  );
  dailyChart = refreshDailyChartSeries(
    dailyChart,
    'G',
    'Generator / Other',
    dailyCategories,
    dailyLogs.map((daily) => daily.ancillaryFuel),
  );
  dailyChart = dailyChart
    .replaceAll('<c:bar3DChart>', '<c:barChart>')
    .replaceAll('</c:bar3DChart>', '</c:barChart>')
    .replace('<c:shape val="box"/>', '')
    .replace('<c:axId val="0"/>', '');
  outputZip.file('xl/charts/chart2.xml', dailyChart);

  const sheet1RelationshipsName = 'xl/worksheets/_rels/sheet1.xml.rels';
  let sheet1Relationships = await requiredZipText(outputZip, sheet1RelationshipsName);
  if (!sheet1Relationships.includes('relationships/drawing')) {
    sheet1Relationships = sheet1Relationships.replace(
      '</Relationships>',
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
    );
  }
  outputZip.file(sheet1RelationshipsName, sheet1Relationships);

  const sheet2RelationshipsName = 'xl/worksheets/_rels/sheet2.xml.rels';
  outputZip.file(
    sheet2RelationshipsName,
    await requiredZipText(templateZip, sheet2RelationshipsName),
  );

  const sheet1Name = 'xl/worksheets/sheet1.xml';
  const sheet2Name = 'xl/worksheets/sheet2.xml';
  outputZip.file(sheet1Name, addDrawingReference(await requiredZipText(outputZip, sheet1Name), 'rId3'));
  outputZip.file(sheet2Name, addDrawingReference(await requiredZipText(outputZip, sheet2Name), 'rId1'));

  const contentTypesName = '[Content_Types].xml';
  let contentTypes = await requiredZipText(outputZip, contentTypesName);
  for (const [partName, contentType] of CHART_CONTENT_TYPES) {
    if (contentTypes.includes(`PartName="${partName}"`)) continue;
    contentTypes = contentTypes.replace(
      '</Types>',
      `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`,
    );
  }
  outputZip.file(contentTypesName, contentTypes);

  return outputZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function templatePath() {
  return path.join(process.cwd(), 'public', 'templates', TEMPLATE_NAME);
}

function dateToIso(value: unknown) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
  )).toISOString();
}

function dateKey(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateToIso(value).slice(0, 10);
  if (typeof value !== 'string' || !value.trim()) return '';
  const parsed = new Date(value.replace(/,(?=\d{4})/, ', '));
  if (Number.isNaN(parsed.getTime())) return '';
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
}

function excelDate(iso: string) {
  return new Date(iso);
}

function formatDailyDate(isoDate: string) {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function copyRowStyle(worksheet: ExcelJS.Worksheet, sourceRowNumber: number, targetRowNumber: number) {
  const source = worksheet.getRow(sourceRowNumber);
  const target = worksheet.getRow(targetRowNumber);
  target.height = source.height;
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const sourceCell = source.getCell(column);
    const targetCell = target.getCell(column);
    targetCell.style = { ...sourceCell.style };
    if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
  }
}

async function loadTemplate() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath());
  return workbook;
}

export async function loadVoyageTemplateData() {
  const workbook = await loadTemplate();
  const voyageSheet = workbook.getWorksheet('Voyage Summary');
  const dailySheet = workbook.getWorksheet('Daily log');
  if (!voyageSheet || !dailySheet) throw new Error('The vessel report template is missing required worksheets.');

  const definitions: VoyageDefinition[] = [];
  let currentCycle = 0;
  for (let rowNumber = 5; rowNumber <= 200; rowNumber += 1) {
    const row = voyageSheet.getRow(rowNumber);
    const label = String(row.getCell(1).value ?? '').trim();
    if (/^TOTAL/i.test(label)) break;
    const departure = dateToIso(row.getCell(4).value);
    const arrival = dateToIso(row.getCell(5).value);
    if (!departure || !arrival) continue;
    const numericCycle = Number(row.getCell(1).value);
    const displayCycle = Number.isFinite(numericCycle) && numericCycle > 0;
    if (displayCycle) currentCycle = numericCycle;
    definitions.push({
      id: `V${definitions.length + 1}`,
      cycle: currentCycle || Math.ceil((definitions.length + 1) / 2),
      displayCycle,
      from: String(row.getCell(2).value ?? '').trim(),
      to: String(row.getCell(3).value ?? '').trim(),
      departure,
      arrival,
      distance: Number(row.getCell(11).value ?? 0),
      averageSpeed: Number(row.getCell(12).value ?? 0),
    });
  }

  const dailyMetadata = new Map<string, { location: string; activity: string }>();
  for (let rowNumber = 5; rowNumber <= 200; rowNumber += 1) {
    const row = dailySheet.getRow(rowNumber);
    const key = dateKey(row.getCell(1).value);
    if (!key) continue;
    dailyMetadata.set(key, {
      location: String(row.getCell(2).value ?? '').trim(),
      activity: String(row.getCell(3).value ?? '').trim(),
    });
  }

  return { definitions, dailyMetadata };
}

function monthLabel(key: string) {
  const date = new Date(`${key}-01T00:00:00Z`);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
}

export async function generateVoyageWorkbook(
  dailyLogs: DailyLogRecord[],
  voyages: VoyageResult[],
  vesselName: string,
) {
  const workbook = await loadTemplate();
  const voyageSheet = workbook.getWorksheet('Voyage Summary');
  const dailySheet = workbook.getWorksheet('Daily log');
  if (!voyageSheet || !dailySheet) throw new Error('The vessel report template is missing required worksheets.');

  const sourceVoyageStyleRow = 5;
  const sourceVoyageTotalStyleRow = 39;
  for (let rowNumber = 5; rowNumber <= 250; rowNumber += 1) {
    for (let column = 1; column <= 13; column += 1) voyageSheet.getCell(rowNumber, column).value = null;
  }
  const reportVessel = vesselName.trim();
  voyageSheet.getCell('A1').value = `${reportVessel.toUpperCase()} \u2014 FUEL CONSUMPTION REPORT \u2014 ${voyages.length} VOYAGES`;
  voyageSheet.getCell('A3').value =
    `${reportVessel} \u2014 ME fuel uses each exact voyage window; all AE fuel is combined per day, used in full for one-day voyages, and averaged across multi-day voyages.`;

  voyages.forEach((voyage, index) => {
    const rowNumber = 5 + index;
    copyRowStyle(voyageSheet, sourceVoyageStyleRow, rowNumber);
    const row = voyageSheet.getRow(rowNumber);
    row.getCell(1).value = voyage.displayCycle ? voyage.cycle : null;
    row.getCell(2).value = voyage.from;
    row.getCell(3).value = voyage.to;
    row.getCell(4).value = excelDate(voyage.departure);
    row.getCell(5).value = excelDate(voyage.arrival);
    row.getCell(6).value = voyage.transitHours;
    row.getCell(7).value = voyage.mainEngineFuel;
    row.getCell(8).value = voyage.auxiliaryEngineFuel;
    row.getCell(9).value = { formula: `G${rowNumber}+H${rowNumber}`, result: voyage.totalFuel };
    row.getCell(10).value = {
      formula: `IFERROR(I${rowNumber}/F${rowNumber},0)`,
      result: voyage.averageBurn,
    };
    row.getCell(11).value = voyage.distance;
    row.getCell(12).value = voyage.averageSpeed;
    row.getCell(13).value = {
      formula: `IFERROR(I${rowNumber}/K${rowNumber},0)`,
      result: voyage.fuelPerNauticalMile,
    };
    row.getCell(4).numFmt = 'mmm d, yyyy hh:mm:ss';
    row.getCell(5).numFmt = 'mmm d, yyyy hh:mm:ss';
  });

  const voyageTotalRow = 5 + voyages.length;
  copyRowStyle(voyageSheet, sourceVoyageTotalStyleRow, voyageTotalRow);
  voyageSheet.getCell(voyageTotalRow, 1).value = 'TOTAL / OVERALL';
  const voyageTotals = voyages.reduce(
    (totals, voyage) => ({
      transitHours: totals.transitHours + voyage.transitHours,
      mainEngineFuel: totals.mainEngineFuel + voyage.mainEngineFuel,
      auxiliaryEngineFuel: totals.auxiliaryEngineFuel + voyage.auxiliaryEngineFuel,
      totalFuel: totals.totalFuel + voyage.totalFuel,
      distance: totals.distance + voyage.distance,
    }),
    { transitHours: 0, mainEngineFuel: 0, auxiliaryEngineFuel: 0, totalFuel: 0, distance: 0 },
  );
  const voyageColumnTotals = {
    F: voyageTotals.transitHours,
    G: voyageTotals.mainEngineFuel,
    H: voyageTotals.auxiliaryEngineFuel,
    I: voyageTotals.totalFuel,
    K: voyageTotals.distance,
  } as const;
  for (const [column, result] of Object.entries(voyageColumnTotals)) {
    voyageSheet.getCell(`${column}${voyageTotalRow}`).value = {
      formula: `SUM(${column}5:${column}${voyageTotalRow - 1})`,
      result,
    };
  }
  voyageSheet.getCell(`J${voyageTotalRow}`).value = {
    formula: `IFERROR(I${voyageTotalRow}/F${voyageTotalRow},0)`,
    result: voyageTotals.transitHours > 0 ? voyageTotals.totalFuel / voyageTotals.transitHours : 0,
  };
  voyageSheet.getCell(`L${voyageTotalRow}`).value = {
    formula: `IFERROR(AVERAGE(L5:L${voyageTotalRow - 1}),0)`,
    result: voyages.length > 0
      ? voyages.reduce((sum, voyage) => sum + voyage.averageSpeed, 0) / voyages.length
      : 0,
  };
  voyageSheet.getCell(`M${voyageTotalRow}`).value = {
    formula: `IFERROR(AVERAGE(M5:M${voyageTotalRow - 1}),0)`,
    result: voyages.length > 0
      ? voyages.reduce((sum, voyage) => sum + voyage.fuelPerNauticalMile, 0) / voyages.length
      : 0,
  };

  const sortedDaily = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const sourceDailyStyleRow = 5;
  const sourceMonthTotalStyleRow = 55;
  const sourceCombinedStyleRow = 58;
  for (let rowNumber = 5; rowNumber <= 300; rowNumber += 1) {
    for (let column = 1; column <= 10; column += 1) dailySheet.getCell(rowNumber, column).value = null;
  }
  dailySheet.getCell('A1').value = `${reportVessel.toUpperCase()} \u2014 Port-to-Port Fuel Consumption`;
  if (sortedDaily.length > 0) {
    const firstDate = new Date(`${sortedDaily[0].date}T00:00:00Z`);
    const lastDate = new Date(`${sortedDaily.at(-1)?.date}T00:00:00Z`);
    dailySheet.getCell('A2').value = `${firstDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} to ${lastDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — populated from selected Excel/manual entries`;
  }

  sortedDaily.forEach((daily, index) => {
    const rowNumber = 5 + index;
    copyRowStyle(dailySheet, sourceDailyStyleRow, rowNumber);
    const row = dailySheet.getRow(rowNumber);
    row.getCell(1).value = formatDailyDate(daily.date);
    row.getCell(1).numFmt = '@';
    row.getCell(2).value = daily.location;
    row.getCell(3).value = daily.activity;
    row.getCell(4).value = daily.portHours;
    row.getCell(5).value = daily.starboardHours;
    row.getCell(6).value = daily.mainEngineFuel;
    row.getCell(7).value = daily.ancillaryFuel;
    row.getCell(8).value = {
      formula: `SUM(F${rowNumber}:G${rowNumber})`,
      result: daily.totalFuel,
    };
    row.getCell(9).value = null;
    row.getCell(10).value = daily.warnings.length > 0 ? daily.warnings.join(' ') : null;
  });

  const groupRanges = new Map<string, { start: number; end: number }>();
  sortedDaily.forEach((daily, index) => {
    const key = daily.date.slice(0, 7);
    const rowNumber = 5 + index;
    const current = groupRanges.get(key);
    groupRanges.set(key, current ? { ...current, end: rowNumber } : { start: rowNumber, end: rowNumber });
  });

  const monthTotalRows: number[] = [];
  let summaryRow = Math.max(55, 5 + sortedDaily.length + 1);
  for (const [key, range] of groupRanges) {
    copyRowStyle(dailySheet, sourceMonthTotalStyleRow, summaryRow);
    dailySheet.getCell(summaryRow, 1).value = `TOTAL — ${monthLabel(key)}`;
    const groupRecords = sortedDaily.slice(range.start - 5, range.end - 4);
    const groupTotals = {
      D: groupRecords.reduce((sum, daily) => sum + daily.portHours, 0),
      E: groupRecords.reduce((sum, daily) => sum + daily.starboardHours, 0),
      F: groupRecords.reduce((sum, daily) => sum + daily.mainEngineFuel, 0),
      G: groupRecords.reduce((sum, daily) => sum + daily.ancillaryFuel, 0),
      H: groupRecords.reduce((sum, daily) => sum + daily.totalFuel, 0),
    } as const;
    for (const [column, result] of Object.entries(groupTotals)) {
      dailySheet.getCell(`${column}${summaryRow}`).value = {
        formula: `SUM(${column}${range.start}:${column}${range.end})`,
        result,
      };
    }
    monthTotalRows.push(summaryRow);
    summaryRow += 1;
  }

  copyRowStyle(dailySheet, sourceCombinedStyleRow, summaryRow);
  dailySheet.getCell(summaryRow, 1).value = 'TOTAL — COMBINED';
  const combinedTotals = {
    D: sortedDaily.reduce((sum, daily) => sum + daily.portHours, 0),
    E: sortedDaily.reduce((sum, daily) => sum + daily.starboardHours, 0),
    F: sortedDaily.reduce((sum, daily) => sum + daily.mainEngineFuel, 0),
    G: sortedDaily.reduce((sum, daily) => sum + daily.ancillaryFuel, 0),
    H: sortedDaily.reduce((sum, daily) => sum + daily.totalFuel, 0),
  } as const;
  for (const [column, result] of Object.entries(combinedTotals)) {
    dailySheet.getCell(`${column}${summaryRow}`).value = {
      formula: monthTotalRows.length > 0
        ? monthTotalRows.map((row) => `${column}${row}`).join('+')
        : '0',
      result,
    };
  }

  workbook.calcProperties.fullCalcOnLoad = true;

  const generated = await workbook.xlsx.writeBuffer();
  return preserveTemplateCharts(generated, voyages.length, sortedDaily);
}
