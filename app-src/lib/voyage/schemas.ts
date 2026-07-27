import { z } from 'zod';

const boundedNumber = z.number().finite().min(0).max(100_000_000);

export const vesselNameSchema = z.string()
  .trim()
  .min(1, 'Enter the vessel name.')
  .max(80, 'Vessel names must be 80 characters or fewer.')
  .regex(/^[^\u0000-\u001f\u007f]+$/, 'The vessel name contains unsupported characters.');

export const manualDailyLogInputSchema = z.object({
  id: z.string().trim().min(1).max(100),
  date: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/),
  location: z.string().trim().max(200),
  activity: z.string().trim().max(300),
  portHours: z.number().finite().min(0).max(24),
  starboardHours: z.number().finite().min(0).max(24),
  mainEngineFuel: boundedNumber,
  auxiliaryEngineFuel: boundedNumber.default(0),
  otherFuel: boundedNumber.default(0),
});

export const voyageDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(30),
  cycle: z.number().int().min(1).max(1_000),
  displayCycle: z.boolean(),
  from: z.string().trim().max(100),
  to: z.string().trim().max(100),
  departure: z.iso.datetime(),
  arrival: z.iso.datetime(),
  distance: z.number().finite().min(0).max(100_000),
  averageSpeed: z.number().finite().min(0).max(1_000),
  status: z.enum(['planned', 'underway', 'paused', 'completed', 'aborted']).default('completed'),
  source: z.enum(['template', 'manual', 'suggested']).default('manual'),
  confirmed: z.boolean().default(true),
  interruptionReason: z.string().trim().max(1_000).default(''),
  mainEngineFuelOverride: boundedNumber.nullish(),
  otherFuelOverride: boundedNumber.nullish(),
  auxiliaryEngineFuelOverride: boundedNumber.nullish(),
});

export const reportDateSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);

const operatingIntervalSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  durationHours: boundedNumber,
});

const componentSummarySchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum([
    'port-main-engine',
    'starboard-main-engine',
    'auxiliary-engine',
    'emergency-engine',
    'other',
  ]),
  workingHours: boundedNumber,
  fuel: boundedNumber,
  occurrences: z.number().int().min(0).max(100_000),
  intervals: z.array(operatingIntervalSchema).max(1_000),
});

export const dailyLogRecordSchema = z.object({
  source: z.enum(['excel', 'manual']),
  fileName: z.string().trim().min(1).max(260),
  vesselName: vesselNameSchema,
  date: reportDateSchema,
  location: z.string().trim().max(200),
  activity: z.string().trim().max(300),
  portHours: boundedNumber,
  starboardHours: boundedNumber,
  mainEngineFuel: boundedNumber,
  auxiliaryEngineFuel: boundedNumber,
  ancillaryFuel: boundedNumber,
  totalFuel: boundedNumber,
  components: z.array(componentSummarySchema).max(200),
  warnings: z.array(z.string().max(1_000)).max(200),
});
