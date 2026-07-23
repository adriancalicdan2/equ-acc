import { z } from 'zod';
import { VIEW_IDS } from '@/lib/server/auth';

const shortText = z.string().trim().max(200);
const longText = z.string().trim().max(5_000);
const dateText = z.string().trim().max(40);
const money = z.coerce.number().finite().min(0).max(100_000_000);
const viewId = z.enum(VIEW_IDS);

export const adminUserRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    email: z.email().trim().toLowerCase(),
    displayName: shortText,
    password: z.string().min(8).max(128),
    role: z.enum(['admin', 'user']),
    allowedViews: z.array(viewId).max(VIEW_IDS.length),
    shiftHours: z.coerce.number().finite().min(1).max(24),
    restDays: z.array(z.number().int().min(0).max(6)).max(7),
  }),
  z.object({
    action: z.literal('update'),
    uid: z.string().min(1).max(128),
    email: z.email().trim().toLowerCase().optional(),
    displayName: shortText.optional(),
    password: z.string().min(8).max(128).optional(),
    role: z.enum(['admin', 'user']).optional(),
    allowedViews: z.array(viewId).max(VIEW_IDS.length).optional(),
    shiftHours: z.coerce.number().finite().min(1).max(24).optional(),
    restDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  }),
  z.object({
    action: z.literal('delete'),
    uid: z.string().min(1).max(128),
  }),
]);

export const installationReportSchema = z.object({
  vessel: shortText,
  representative: shortText,
  date: dateText,
  refCO: shortText,
  items: z.array(z.object({ qty: shortText, remarks: longText })).max(9).default([]),
  reportSummary: longText,
  aimfRep: shortText,
  zeahoRep: shortText,
  technicalSup: shortText,
});

export const payslipSchema = z.object({
  dateOfJoining: dateText,
  employeeName: shortText.min(1),
  payPeriod: shortText,
  designation: shortText,
  workedDays: z.union([z.string().max(20), z.number().finite()]),
  department: shortText,
  basic: money,
  incentivePay: money,
  overtime: money,
  otherEarnings: money,
  absences: money,
  otherDeductions: money,
});

const pettyCashItemSchema = z.object({
  date: dateText,
  referenceNo: shortText,
  payeeName: shortText,
  particular: longText,
  gross: money,
  remarks: longText,
});

export const pettyCashSchema = z.object({
  companyName: shortText,
  periodFrom: dateText,
  periodTo: dateText,
  beginningBalance: money,
  beginningDate: dateText,
  cashOnHand: money,
  cashOnHandDate: dateText,
  amountReplenished: money,
  replenishmentDate: dateText,
  balanceEndingDate: dateText,
  preparedBy: shortText,
  preparedDate: dateText,
  approvedBy: shortText,
  approvedDate: dateText,
  items: z.array(pettyCashItemSchema).max(18).default([]),
});

const dayEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum([
    'Present',
    'Absent',
    'Rest Day',
    'Half-day',
    'Regular Holiday',
    'Special Holiday',
    'Holiday No Work',
    'Special Holiday on Rest Day',
    'Regular Holiday on Rest Day',
    'Holiday',
  ]),
  timeIn: z.string().max(10),
  timeOut: z.string().max(10),
  otRemarks: longText.optional(),
});

export const timecardSchema = z.object({
  employeeName: shortText.min(1),
  monthName: shortText.min(1),
  period1: z.array(dayEntrySchema).max(16).default([]),
  period2: z.array(dayEntrySchema).max(17).default([]),
  shiftHours: z.coerce.number().finite().min(1).max(24).default(10),
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

export const docxTextSchema = z.object({
  vesselName: shortText.min(1),
  installationDate: dateText,
  leadEngineer: shortText.min(1),
  flsCapacitanceQty: shortText,
  flsCapacitanceTank: shortText,
  flsCapacitanceSN: longText,
  flsCapacitanceStatus: z.enum(['good', 'defective']),
  flsFloaterQty: shortText,
  flsFloaterTank: shortText,
  flsFloaterSN: longText,
  flsFloaterStatus: z.enum(['good', 'defective']),
  networkQty: shortText,
  networkSN: longText,
  networkSignalStatus: z.enum(['excellent', 'good', 'poor']),
  engineQty: shortText,
  engineConnected: longText,
  engineSN: longText,
  solarQty: shortText,
  solarLocation: longText,
  solarSN: longText,
  solarPowerStatus: z.enum(['fully_charged', 'charging', 'operational']),
  remarks: longText,
  techName: shortText,
  techDesignation: shortText,
  signoffDate: dateText,
  receiverName: shortText,
  receiverDesignation: shortText,
  copyTypes: z.array(z.enum(['aimf', 'vessel', 'vessel_owner', 'likas'])).min(1).max(4),
});
