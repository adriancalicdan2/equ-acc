import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const {
      companyName, periodFrom, periodTo,
      beginningBalance, beginningDate,
      cashOnHand, cashOnHandDate,
      amountReplenished, replenishmentDate, balanceEndingDate,
      preparedBy, preparedDate, approvedBy, approvedDate,
      items = [],
    } = data;

    const num = (v: any) => parseFloat(v || '0') || 0;
    const begBal = num(beginningBalance);
    const coh = num(cashOnHand);
    const replAmt = num(amountReplenished);

    // Read the template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'Petty Cash Report.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet(1);
    if (!ws) {
      throw new Error('Worksheet not found in template');
    }

    // Set header values
    if (companyName) {
      ws.getCell('A1').value = companyName;
    }
    
    // Use date format matching the new template headers
    ws.getCell('C4').value = periodFrom ? `FROM: ${periodFrom}` : null;
    ws.getCell('E4').value = periodTo ? `TO: ${periodTo}` : null;

    // Clear sample rows in the template (rows 8 to 25)
    for (let r = 8; r <= 25; r++) {
      ws.getCell(`B${r}`).value = null; // Date
      ws.getCell(`C${r}`).value = null; // Reference No
      ws.getCell(`D${r}`).value = null; // Payee Name
      ws.getCell(`E${r}`).value = null; // Particular
      ws.getCell(`F${r}`).value = null; // Amount
      ws.getCell(`G${r}`).value = null; // Remarks
    }

    // Populate actual items (up to 18 items max to fit in the template rows 8 to 25)
    items.forEach((item: any, idx: number) => {
      const r = 8 + idx;
      if (r > 25) return; // limit to template boundaries for layout safety

      ws.getCell(`B${r}`).value = item.date ? new Date(item.date) : null;
      ws.getCell(`C${r}`).value = item.referenceNo || null;
      ws.getCell(`D${r}`).value = item.payeeName || null;
      ws.getCell(`E${r}`).value = item.particular || null;
      ws.getCell(`F${r}`).value = num(item.gross) || null;
      ws.getCell(`G${r}`).value = item.remarks || null;
    });

    // Totals row (Row 27) Amount sum formula
    ws.getCell('F27').value = { formula: 'SUM(F8:F25)' };

    // Summary block formulas and inputs
    ws.getCell('E29').value = beginningDate ? new Date(beginningDate) : null;
    ws.getCell('F29').value = begBal;
    
    ws.getCell('F30').value = { formula: 'F27' };
    ws.getCell('F31').value = { formula: 'F29-F30' };
    
    ws.getCell('E32').value = cashOnHandDate ? new Date(cashOnHandDate) : null;
    ws.getCell('F32').value = coh || null;
    ws.getCell('F33').value = { formula: '+F31-F32' };
    
    ws.getCell('E35').value = replenishmentDate ? new Date(replenishmentDate) : null;
    ws.getCell('F35').value = replAmt || null;
    
    ws.getCell('E37').value = balanceEndingDate ? new Date(balanceEndingDate) : null;

    // Signatories
    ws.getCell('C39').value = preparedBy || null;
    ws.getCell('C40').value = preparedDate ? new Date(preparedDate) : null;
    ws.getCell('G39').value = approvedBy || null;
    ws.getCell('G40').value = approvedDate ? new Date(approvedDate) : null;

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Petty-Cash-Report.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('Petty cash generation error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
