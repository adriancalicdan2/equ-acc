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
    
    // Use date object or string for period dates
    ws.getCell('C4').value = periodFrom ? new Date(periodFrom) : null;
    ws.getCell('E4').value = periodTo ? new Date(periodTo) : null;

    // Clear sample rows in the template (rows 8 to 25)
    for (let r = 8; r <= 25; r++) {
      ws.getCell(`B${r}`).value = null; // Date
      ws.getCell(`C${r}`).value = null; // Reference No
      ws.getCell(`D${r}`).value = null; // Payee Name
      ws.getCell(`E${r}`).value = null; // TIN
      ws.getCell(`F${r}`).value = null; // Particular
      ws.getCell(`G${r}`).value = null; // Gross
      ws.getCell(`H${r}`).value = null; // Remarks
      ws.getCell(`J${r}`).value = null; // VAT
      ws.getCell(`K${r}`).value = null; // Transpo
      ws.getCell(`L${r}`).value = null; // Meals
      ws.getCell(`M${r}`).value = null; // Freight
      ws.getCell(`N${r}`).value = null; // Communication
      ws.getCell(`O${r}`).value = null; // Office Supplies
      ws.getCell(`P${r}`).value = null; // Miscellaneous
      ws.getCell(`Q${r}`).value = null; // Other
    }

    // Populate actual items (up to 18 items max to fit in the template rows 8 to 25)
    items.forEach((item: any, idx: number) => {
      const r = 8 + idx;
      if (r > 25) return; // limit to template boundaries for layout safety

      ws.getCell(`B${r}`).value = item.date ? new Date(item.date) : null;
      ws.getCell(`C${r}`).value = item.referenceNo || null;
      ws.getCell(`D${r}`).value = item.payeeName || null;
      ws.getCell(`E${r}`).value = item.tin || null;
      ws.getCell(`F${r}`).value = item.particular || null;
      ws.getCell(`G${r}`).value = num(item.gross) || null;
      ws.getCell(`H${r}`).value = item.remarks || null;
      
      ws.getCell(`J${r}`).value = num(item.vat) || null;
      ws.getCell(`K${r}`).value = num(item.transpo) || null;
      ws.getCell(`L${r}`).value = num(item.meals) || null;
      ws.getCell(`M${r}`).value = num(item.freight) || null;
      ws.getCell(`N${r}`).value = num(item.communication) || null;
      ws.getCell(`O${r}`).value = num(item.officeSupplies) || null;
      ws.getCell(`P${r}`).value = num(item.miscellaneous) || null;
      ws.getCell(`Q${r}`).value = num(item.other) || null;
    });

    // Totals row (Row 27) Gross sum formula
    ws.getCell('G27').value = { formula: 'SUM(G8:G25)' };

    // Summary block formulas and inputs
    ws.getCell('E29').value = beginningDate ? new Date(beginningDate) : null;
    ws.getCell('G29').value = begBal;
    
    ws.getCell('G30').value = { formula: 'G27' };
    ws.getCell('G31').value = { formula: 'G29-G30' };
    
    ws.getCell('E32').value = cashOnHandDate ? new Date(cashOnHandDate) : null;
    ws.getCell('G32').value = coh || null;
    ws.getCell('G33').value = { formula: 'G31-G32' };
    
    ws.getCell('E35').value = replenishmentDate ? new Date(replenishmentDate) : null;
    ws.getCell('G35').value = replAmt || null;
    
    ws.getCell('E37').value = balanceEndingDate ? new Date(balanceEndingDate) : null;

    // Signatories
    ws.getCell('C40').value = preparedBy || null;
    ws.getCell('D41').value = preparedDate ? new Date(preparedDate) : null;
    ws.getCell('J41').value = approvedBy || null;
    ws.getCell('K42').value = approvedDate ? new Date(approvedDate) : null;

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
