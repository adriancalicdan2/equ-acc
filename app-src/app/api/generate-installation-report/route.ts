import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';

// Fixed installation items that match the xlsx template rows 13–21
const INSTALL_ITEMS = [
  'Work our monitoring points',
  'Oil Level Monitoring',
  'Whole-Ship Intelligent Networking',
  'Data Storage & Transmission',
  'Data Storage & Transmission (Oil Level)',
  'Intelligent Analysis Subs (Working Hour)',
  'Intelligent Analysis Subs (Fuel)',
  'System Delivery Service Fee',
  'System Operation Service Fee',
];

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const {
      vessel,
      representative,
      date,
      refCO,
      items = [], // Array of { qty: string, remarks: string } — 9 items matching INSTALL_ITEMS
      reportSummary,
      acknowledgedBy,
    } = data;

    // Read the template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'AIMF_ Installation Report.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet(1);
    if (!ws) throw new Error('Worksheet not found in template');

    // Header fields
    if (vessel)         ws.getCell('H6').value = vessel;
    if (representative) ws.getCell('H7').value = representative;
    if (date)           ws.getCell('L9').value = date;
    if (refCO)          ws.getCell('L10').value = refCO;

    // Install items — rows 13 to 21 (9 items)
    items.forEach((item: { qty: string; remarks: string }, idx: number) => {
      const row = 13 + idx;
      if (row > 21) return;
      if (item.qty)     ws.getCell(`H${row}`).value = item.qty;
      if (item.remarks) ws.getCell(`K${row}`).value = item.remarks;
    });

    // Report summary — write to the merged summary area (rows 24–28, col A)
    if (reportSummary) {
      ws.getCell('A25').value = reportSummary;
    }

    // Acknowledged by
    if (acknowledgedBy) ws.getCell('B32').value = acknowledgedBy;

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Installation-Report.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('Installation report generation error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
