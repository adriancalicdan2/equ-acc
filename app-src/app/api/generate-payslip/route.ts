import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import { calculatePayroll, type PayrollInput } from '@/lib/payrollCalc';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { parseJsonRequest } from '@/lib/server/request';
import { payslipSchema } from '@/lib/validations/apiSchemas';

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { view: 'payslip' });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`generate-payslip:${authorization.token.uid}`, 30, 60_000);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request, payslipSchema);
  if (!parsed.success) return parsed.response;

  try {
    const {
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
      otherDeductions,
    } = parsed.data;

    const payrollInput: PayrollInput = {
      basic,
      incentivePay,
      overtime,
      otherEarnings,
      absences,
      otherDeductions,
    };
    const results = calculatePayroll(payrollInput);

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'paysliper-template-list1.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet('List1') || workbook.worksheets[0];
    if (!worksheet) throw new Error('Worksheet not found in template');

    const heading = worksheet.getCell('A1').value;
    if (heading && typeof heading === 'object' && 'richText' in heading && Array.isArray(heading.richText)) {
      heading.richText = heading.richText.map((part) => ({
        ...part,
        text: part.text?.replace('Lead Trend Marine Services', 'AIMF Technologies Corporation'),
      }));
      worksheet.getCell('A1').value = heading;
    }

    worksheet.getCell('B4').value = `: ${dateOfJoining}`;
    worksheet.getCell('D4').value = `: ${employeeName}`;
    worksheet.getCell('B5').value = `: ${payPeriod}`;
    worksheet.getCell('D5').value = `: ${designation}`;
    worksheet.getCell('B6').value = `: ${workedDays}`;
    worksheet.getCell('D6').value = `: ${department}`;

    worksheet.getCell('D10').value = results.basicCutoff;
    worksheet.getCell('D11').value = incentivePay;
    worksheet.getCell('D12').value = overtime;
    worksheet.getCell('D13').value = otherEarnings;
    worksheet.getCell('D15').value = { formula: 'SUM(D10:D13)', result: results.grossEarnings };

    worksheet.getCell('D18').value = results.pagibig;
    worksheet.getCell('D19').value = results.philhealth;
    worksheet.getCell('D20').value = results.sss;
    worksheet.getCell('D21').value = results.withholdingTax;
    worksheet.getCell('D22').value = absences;
    worksheet.getCell('D23').value = otherDeductions;
    worksheet.getCell('D25').value = { formula: 'SUM(D18:D23)', result: results.totalDeductions };
    worksheet.getCell('D26').value = { formula: 'D15-D25', result: results.netPay };

    worksheet.getCell('A27').value = { formula: 'D26', result: results.netPay };
    worksheet.getCell('B27').value = null;
    worksheet.getCell('C27').value = null;
    worksheet.getCell('D27').value = null;
    worksheet.getCell('A28').value = `${results.netPayWords} Only`;
    worksheet.getCell('B28').value = null;
    worksheet.getCell('C28').value = null;
    worksheet.getCell('D28').value = null;

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmployeeName = employeeName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Payslip-${safeEmployeeName}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('[generate-payslip] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
