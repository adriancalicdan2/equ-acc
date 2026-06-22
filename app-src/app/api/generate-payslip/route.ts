import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import { calculatePayroll, PayrollInput } from '@/lib/payrollCalc';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
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
      otherDeductions
    } = data;

    // Run calculations
    const payrollInput: PayrollInput = {
      basic: Number(basic) || 0,
      incentivePay: Number(incentivePay) || 0,
      overtime: Number(overtime) || 0,
      otherEarnings: Number(otherEarnings) || 0,
      absences: Number(absences) || 0,
      otherDeductions: Number(otherDeductions) || 0
    };

    const results = calculatePayroll(payrollInput);

    // Read the template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'paysliper-template-list1.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet('List1') || workbook.worksheets[0];
    if (!ws) {
      throw new Error('Worksheet not found in template');
    }

    // Replace Lead Trend Marine Services with AIMF Technologies Corporation in A1 cell
    const a1Val = ws.getCell('A1').value;
    if (a1Val && typeof a1Val === 'object' && 'richText' in a1Val && Array.isArray(a1Val.richText)) {
      a1Val.richText = a1Val.richText.map((part: any) => {
        if (part.text && part.text.includes('Lead Trend Marine Services')) {
          part.text = part.text.replace('Lead Trend Marine Services', 'AIMF Technologies Corporation');
        }
        return part;
      });
      ws.getCell('A1').value = a1Val;
    }

    // Set metadata
    ws.getCell('B4').value = ': ' + (dateOfJoining || '');
    ws.getCell('D4').value = ': ' + (employeeName || '');
    ws.getCell('B5').value = ': ' + (payPeriod || '');
    ws.getCell('D5').value = ': ' + (designation || '');
    ws.getCell('B6').value = ': ' + (workedDays || '');
    ws.getCell('D6').value = ': ' + (department || '');

    // Set Earnings
    ws.getCell('D10').value = results.basicCutoff;
    ws.getCell('D11').value = payrollInput.incentivePay;
    ws.getCell('D12').value = payrollInput.overtime;
    ws.getCell('D13').value = payrollInput.otherEarnings;
    ws.getCell('D15').value = { formula: 'SUM(D10:D13)', result: results.grossEarnings };

    // Set Deductions
    ws.getCell('D18').value = results.pagibig;
    ws.getCell('D19').value = results.philhealth;
    ws.getCell('D20').value = results.sss;
    ws.getCell('D21').value = results.withholdingTax;
    ws.getCell('D22').value = payrollInput.absences;
    ws.getCell('D23').value = payrollInput.otherDeductions;

    // Total Deductions formula and value
    ws.getCell('D25').value = { formula: 'SUM(D18:D23)', result: results.totalDeductions };

    // Net Pay formula and value
    ws.getCell('D26').value = { formula: 'D15-D25', result: results.netPay };

    // Net Pay display at Row 27
    ws.getCell('A27').value = { formula: 'D26', result: results.netPay };
    ws.getCell('B27').value = null;
    ws.getCell('C27').value = null;
    ws.getCell('D27').value = null;

    // Net Pay Words display at Row 28
    ws.getCell('A28').value = results.netPayWords + ' Only';
    ws.getCell('B28').value = null;
    ws.getCell('C28').value = null;
    ws.getCell('D28').value = null;

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Payslip-${employeeName.replace(/\s+/g, '_')}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('Error generating payslip:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
