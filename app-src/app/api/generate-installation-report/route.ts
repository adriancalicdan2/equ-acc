import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { parseJsonRequest } from '@/lib/server/request';
import { installationReportSchema } from '@/lib/validations/apiSchemas';

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { view: 'installation-report' });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`generate-installation:${authorization.token.uid}`, 30, 60_000);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request, installationReportSchema);
  if (!parsed.success) return parsed.response;

  try {
    const {
      vessel,
      representative,
      date,
      refCO,
      items,
      reportSummary,
      aimfRep,
      zeahoRep,
      technicalSup,
    } = parsed.data;

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'AIMF_ Installation Report.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    workbook.eachSheet((worksheet) => {
      if (vessel) worksheet.getCell('A6').value = `Vessel: ${vessel}`;
      if (representative) worksheet.getCell('A7').value = `AIMF I.T Representative: ${representative}`;
      if (date) worksheet.getCell('K9').value = `Date: ${date}`;
      if (refCO) worksheet.getCell('L10').value = refCO;

      items.forEach((item, index) => {
        const row = 13 + index;
        if (row > 21) return;
        const quantityCell = row === 13 ? 'I13' : `H${row}`;
        if (item.qty) worksheet.getCell(quantityCell).value = item.qty;
        if (item.remarks) worksheet.getCell(`K${row}`).value = item.remarks;
      });

      if (reportSummary) worksheet.getCell('A25').value = reportSummary;
      if (aimfRep) worksheet.getCell('A32').value = aimfRep;
      if (zeahoRep) worksheet.getCell('E32').value = zeahoRep;
      if (technicalSup) worksheet.getCell('K32').value = technicalSup;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Installation-Report.xlsx"',
      },
    });
  } catch (error) {
    console.error('[generate-installation-report] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
