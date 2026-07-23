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
  auxiliaryEngineFuel: boundedNumber,
  otherFuel: boundedNumber,
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
  mainEngineFuelOverride: boundedNumber.nullish(),
  auxiliaryEngineFuelOverride: boundedNumber.nullish(),
});

export const reportDateSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
