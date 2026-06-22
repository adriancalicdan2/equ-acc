/**
 * Payroll calculation engine for 2026 Philippine payroll computations.
 * Custom built for Semi-Monthly Cutoff calculations.
 */

export interface PayrollInput {
  basic: number; // Monthly Basic Salary
  incentivePay: number; // Cutoff Incentive Pay
  overtime: number; // Cutoff Overtime Pay
  otherEarnings: number; // Cutoff Other Earnings
  absences: number; // Cutoff Absences Deduction
  otherDeductions: number; // Cutoff Other Deductions
}

export interface PayrollResult {
  monthlyBasic: number;
  basicCutoff: number;
  grossEarnings: number;
  sss: number; // Split (Monthly / 2)
  philhealth: number; // Split (Monthly / 2)
  pagibig: number; // Split (Monthly / 2)
  taxableIncome: number; // Monthly equivalent taxable income
  withholdingTax: number; // Split (Monthly Tax / 2)
  absences: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  netPayWords: string;
}

/**
 * Calculates SSS Employee Share:
 * 5% of MSC (Monthly Salary Credit), capped at 1,750 for basic monthly salaries of 35,000 and above.
 */
export function calculateSSS(basic: number): number {
  const msc = basic >= 35000 ? 35000 : basic;
  return msc * 0.05;
}

/**
 * Calculates PhilHealth Employee Share:
 * 2.5% of basic salary, minimum of 250, capped at 2,500 for basic salaries of 100,000 and above.
 */
export function calculatePhilHealth(basic: number): number {
  const contribution = basic * 0.025;
  return Math.max(250, Math.min(2500, contribution));
}

/**
 * Calculates Pag-IBIG Employee Share:
 * 2% of basic monthly salary, capped at 200 for basic salaries of 10,000 and above.
 */
export function calculatePagIBIG(basic: number): number {
  if (basic >= 10000) {
    return 200;
  }
  return basic * 0.02;
}

/**
 * Calculates Withholding Tax based on 2026 TRAIN Law monthly brackets:
 * - 20,833 and below: 0%
 * - 20,834 to 33,333: 15% of the excess over 20,833
 * - 33,334 to 66,666: 1,875 + 20% of the excess over 33,334
 * - 66,667 to 166,666: 8,541.67 + 25% of the excess over 66,667
 * - 166,667 and above: 33,541.67 + 30% of the excess over 166,667
 */
export function calculateWithholdingTax(taxableIncome: number): number {
  if (taxableIncome <= 20833) {
    return 0;
  } else if (taxableIncome <= 33333) {
    return (taxableIncome - 20833) * 0.15;
  } else if (taxableIncome <= 66666) {
    return 1875 + (taxableIncome - 33334) * 0.20;
  } else if (taxableIncome <= 166666) {
    return 8541.67 + (taxableIncome - 66667) * 0.25;
  } else {
    return 33541.67 + (taxableIncome - 166667) * 0.30;
  }
}

/**
 * Converts a number to its English word representation (for Net Pay).
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  
  // Clean decimal part if any
  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];

  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  const scales = ['', 'Thousand', 'Million', 'Billion'];

  function convertSection(n: number): string {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  let temp = integerPart;
  let wordResult = '';
  let scaleIndex = 0;

  while (temp > 0) {
    const chunk = temp % 1000;
    if (chunk > 0) {
      const chunkStr = convertSection(chunk);
      wordResult = chunkStr + (scales[scaleIndex] ? ' ' + scales[scaleIndex] : '') + ' ' + wordResult;
    }
    temp = Math.floor(temp / 1000);
    scaleIndex++;
  }

  wordResult = wordResult.trim();

  // Handle fractional parts
  if (decimalPart > 0) {
    wordResult += ` and ${decimalPart}/100`;
  }
  
  return wordResult || 'Zero';
}

/**
 * Main calculation logic.
 * Handles semi-monthly calculations by computing monthly equivalents first.
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const basic = Math.max(0, input.basic);
  const basicCutoff = basic / 2;
  const incentivePay = Math.max(0, input.incentivePay);
  const overtime = Math.max(0, input.overtime);
  const otherEarnings = Math.max(0, input.otherEarnings);

  // Cutoff Gross Pay
  const grossEarnings = basicCutoff + incentivePay + overtime + otherEarnings;

  // Monthly statutory contributions
  const sssMonthly = calculateSSS(basic);
  const philhealthMonthly = calculatePhilHealth(basic);
  const pagibigMonthly = calculatePagIBIG(basic);

  // Semi-monthly split contributions
  const sss = sssMonthly / 2;
  const philhealth = philhealthMonthly / 2;
  const pagibig = pagibigMonthly / 2;

  // Absences deduction
  const absences = Math.max(0, input.absences);
  const otherDeductions = Math.max(0, input.otherDeductions);

  // Monthly Equivalent Taxable Income:
  // (Gross Cutoff - (SSS Cutoff + PhilHealth Cutoff + Pag-IBIG Cutoff) - Absences) * 2
  const taxableIncomeCutoff = Math.max(0, grossEarnings - (sss + philhealth + pagibig) - absences);
  const taxableIncome = taxableIncomeCutoff * 2;

  // Monthly Tax / 2
  const withholdingTax = calculateWithholdingTax(taxableIncome) / 2;

  const totalDeductions = sss + philhealth + pagibig + withholdingTax + absences + otherDeductions;
  const netPay = Math.max(0, grossEarnings - totalDeductions);

  return {
    monthlyBasic: basic,
    basicCutoff,
    grossEarnings,
    sss,
    philhealth,
    pagibig,
    taxableIncome,
    withholdingTax,
    absences,
    otherDeductions,
    totalDeductions,
    netPay,
    netPayWords: numberToWords(netPay)
  };
}
