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
      aimfRep,      // AIMF Tech Corp signatory
      zeahoRep,     // ZEAHO (NANJING) signatory
      technicalSup, // Technical Superintendent signatory
    } = data;

    // Read the template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'AIMF_ Installation Report.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    // Fill all sheets in the workbook (Report, NARRA)
    workbook.eachSheet((ws) => {
      // Header fields — write label+value into the same merged cell
      if (vessel)         ws.getCell('A6').value = 'Vessel: ' + vessel;
      if (representative) ws.getCell('A7').value = 'AIMF I.T Representative: ' + representative;
      if (date)           ws.getCell('K9').value = 'Date: ' + date;
      if (refCO)          ws.getCell('L10').value = refCO;

      // Install items — rows 13 to 21 (9 items)
      // Note: row 13 has a different merge layout — qty master is I13, rows 14-21 use H{row}
      items.forEach((item: { qty: string; remarks: string }, idx: number) => {
        const row = 13 + idx;
        if (row > 21) return;
        const qtyCell = row === 13 ? 'I13' : `H${row}`;
        if (item.qty)     ws.getCell(qtyCell).value = item.qty;
        if (item.remarks) ws.getCell(`K${row}`).value = item.remarks;
      });

      // Report summary — write to the merged summary area (rows 24–28, col A)
      if (reportSummary) {
        ws.getCell('A25').value = reportSummary;
      }

      // Signatories — each goes into the signature line (row 32) above their company label (row 33)
      if (aimfRep)      ws.getCell('A32').value = aimfRep;
      if (zeahoRep)     ws.getCell('E32').value = zeahoRep;
      if (technicalSup) ws.getCell('K32').value = technicalSup;
    });

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
