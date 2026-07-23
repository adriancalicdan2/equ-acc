import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { parseJsonRequest } from '@/lib/server/request';
import { pettyCashSchema } from '@/lib/validations/apiSchemas';

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { view: 'petty-cash' });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`generate-petty-cash:${authorization.token.uid}`, 30, 60_000);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request, pettyCashSchema);
  if (!parsed.success) return parsed.response;

  try {
    const {
      companyName,
      periodFrom,
      periodTo,
      beginningBalance,
      beginningDate,
      cashOnHand,
      cashOnHandDate,
      amountReplenished,
      replenishmentDate,
      balanceEndingDate,
      preparedBy,
      preparedDate,
      approvedBy,
      approvedDate,
      items,
    } = parsed.data;

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'Petty Cash Report.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error('Worksheet not found in template');

    if (companyName) worksheet.getCell('A1').value = companyName;
    worksheet.getCell('C4').value = periodFrom ? `FROM: ${periodFrom}` : null;
    worksheet.getCell('E4').value = periodTo ? `TO: ${periodTo}` : null;

    for (let row = 8; row <= 25; row += 1) {
      for (const column of ['B', 'C', 'D', 'E', 'F', 'G']) {
        worksheet.getCell(`${column}${row}`).value = null;
      }
    }

    items.forEach((item, index) => {
      const row = 8 + index;
      if (row > 25) return;
      worksheet.getCell(`B${row}`).value = item.date ? new Date(item.date) : null;
      worksheet.getCell(`C${row}`).value = item.referenceNo || null;
      worksheet.getCell(`D${row}`).value = item.payeeName || null;
      worksheet.getCell(`E${row}`).value = item.particular || null;
      worksheet.getCell(`F${row}`).value = item.gross || null;
      worksheet.getCell(`G${row}`).value = item.remarks || null;
    });

    worksheet.getCell('F27').value = { formula: 'SUM(F8:F25)' };
    worksheet.getCell('E29').value = beginningDate ? new Date(beginningDate) : null;
    worksheet.getCell('F29').value = beginningBalance;
    worksheet.getCell('F30').value = { formula: 'F27' };
    worksheet.getCell('F31').value = { formula: 'F29-F30' };
    worksheet.getCell('E32').value = cashOnHandDate ? new Date(cashOnHandDate) : null;
    worksheet.getCell('F32').value = cashOnHand || null;
    worksheet.getCell('F33').value = { formula: '+F31-F32' };
    worksheet.getCell('E35').value = replenishmentDate ? new Date(replenishmentDate) : null;
    worksheet.getCell('F35').value = amountReplenished || null;
    worksheet.getCell('E37').value = balanceEndingDate ? new Date(balanceEndingDate) : null;
    worksheet.getCell('C39').value = preparedBy || null;
    worksheet.getCell('C40').value = preparedDate ? new Date(preparedDate) : null;
    worksheet.getCell('G39').value = approvedBy || null;
    worksheet.getCell('G40').value = approvedDate ? new Date(approvedDate) : null;

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Petty-Cash-Report.xlsx"',
      },
    });
  } catch (error) {
    console.error('[generate-petty-cash] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
