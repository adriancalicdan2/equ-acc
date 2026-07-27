import ExcelJS from 'exceljs';

export async function verifyVoyageSummaryPopulation(
  generated: Uint8Array | ArrayBuffer,
  expectedVoyageCount: number,
) {
  if (!Number.isInteger(expectedVoyageCount) || expectedVoyageCount <= 0) {
    throw new Error('The report must contain at least one confirmed voyage.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(generated as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Voyage Summary');
  if (!sheet) throw new Error('The generated workbook is missing the Voyage Summary sheet.');

  const title = String(sheet.getCell('A1').value ?? '');
  if (!title.includes(`${expectedVoyageCount} VOYAGE`)) {
    throw new Error('The generated Voyage Summary title does not match the confirmed voyage count.');
  }

  for (let index = 0; index < expectedVoyageCount; index += 1) {
    const rowNumber = 5 + index;
    const departure = sheet.getCell(rowNumber, 4).value;
    const arrival = sheet.getCell(rowNumber, 5).value;
    if (!(departure instanceof Date) || !(arrival instanceof Date)) {
      throw new Error(`Voyage Summary row ${rowNumber} was not populated correctly.`);
    }
  }

  const totalRow = 5 + expectedVoyageCount;
  if (sheet.getCell(totalRow, 1).value !== 'TOTAL / OVERALL') {
    throw new Error('The generated Voyage Summary total row is missing.');
  }

  return { voyageCount: expectedVoyageCount, totalRow };
}
