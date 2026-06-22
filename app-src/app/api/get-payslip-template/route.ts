import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';

export async function GET() {
  try {
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'paysliper-template-list1.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet('List1') || workbook.worksheets[0];
    if (!ws) {
      return NextResponse.json({ error: 'Worksheet not found' }, { status: 404 });
    }

    // Helper to extract value and remove leading colons/whitespace
    const getCleanValue = (cellValue: any): string => {
      if (cellValue === null || cellValue === undefined) return '';
      const str = String(cellValue).trim();
      if (str.startsWith(':')) {
        return str.substring(1).trim();
      }
      return str;
    };

    // Extract metadata
    const dateOfJoining = getCleanValue(ws.getCell('B4').value);
    const employeeName = getCleanValue(ws.getCell('D4').value);
    const payPeriod = getCleanValue(ws.getCell('B5').value);
    const designation = getCleanValue(ws.getCell('D5').value);
    const workedDays = getCleanValue(ws.getCell('B6').value);
    const department = getCleanValue(ws.getCell('D6').value);

    // Extract earnings baseline values
    const basic = Number(ws.getCell('D10').value) || 0;
    const incentivePay = Number(ws.getCell('D11').value) || 0;
    const overtime = Number(ws.getCell('D12').value) || 0;
    const otherEarnings = Number(ws.getCell('D13').value) || 0;

    // Extract deductions baseline values
    const absences = Number(ws.getCell('D22').value) || 0;
    const otherDeductions = Number(ws.getCell('D23').value) || 0;

    return NextResponse.json({
      dateOfJoining,
      employeeName,
      payPeriod,
      designation,
      workedDays,
      department,
      basic,
      incentivePay,
      overtime,
      otherEarnings,
      absences,
      otherDeductions
    });
  } catch (err: any) {
    console.error('Error reading payslip template:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
