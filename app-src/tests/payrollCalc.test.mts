import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePagIBIG,
  calculatePayroll,
  calculatePhilHealth,
  calculateSSS,
  calculateWithholdingTax,
  numberToWords,
} from '../lib/payrollCalc.ts';

test('statutory contributions respect their floors and caps', () => {
  assert.equal(calculateSSS(50_000), 1_750);
  assert.equal(calculatePhilHealth(5_000), 250);
  assert.equal(calculatePhilHealth(150_000), 2_500);
  assert.equal(calculatePagIBIG(8_000), 160);
  assert.equal(calculatePagIBIG(30_000), 200);
});

test('withholding tax follows the configured monthly brackets', () => {
  assert.equal(calculateWithholdingTax(20_833), 0);
  assert.equal(calculateWithholdingTax(30_000), (30_000 - 20_833) * 0.15);
  assert.equal(calculateWithholdingTax(50_000), 1_875 + (50_000 - 33_334) * 0.2);
  assert.equal(calculateWithholdingTax(100_000), 8_541.67 + (100_000 - 66_667) * 0.25);
});

test('semi-monthly payroll combines earnings and deductions consistently', () => {
  const result = calculatePayroll({
    basic: 30_000,
    incentivePay: 1_000,
    overtime: 500,
    otherEarnings: 0,
    absences: 200,
    otherDeductions: 300,
  });

  assert.equal(result.basicCutoff, 15_000);
  assert.equal(result.grossEarnings, 16_500);
  assert.equal(result.sss, 750);
  assert.equal(result.philhealth, 375);
  assert.equal(result.pagibig, 100);
  assert.ok(Math.abs(result.withholdingTax - 698.775) < 0.000_001);
  assert.ok(Math.abs(result.netPay - 14_076.225) < 0.000_001);
});

test('negative monetary inputs cannot create negative earnings or deductions', () => {
  const result = calculatePayroll({
    basic: -1,
    incentivePay: -1,
    overtime: -1,
    otherEarnings: -1,
    absences: -1,
    otherDeductions: -1,
  });

  assert.equal(result.grossEarnings, 0);
  assert.equal(result.absences, 0);
  assert.equal(result.otherDeductions, 0);
  assert.equal(result.netPay, 0);
});

test('net pay amounts are converted to words with centavos', () => {
  assert.equal(numberToWords(1_250.5), 'One Thousand Two Hundred Fifty and 50/100');
});
