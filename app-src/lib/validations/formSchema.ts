import { z } from 'zod';

export const vesselInfoSchema = z.object({
  vesselName: z.string().min(1, 'Vessel Name / IMO No. is required'),
  installationDate: z.string().optional().default(''),
  leadEngineer: z.string().min(1, 'Lead Engineer name is required'),
});

export const flsCapacitanceSchema = z.object({
  qty: z.string().default('1'),
  tankAssigned: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
  calibrationStatus: z.enum(['good', 'defective']).default('good'),
});

export const flsFloaterSchema = z.object({
  qty: z.string().default('1'),
  tankAssigned: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
  calibrationStatus: z.enum(['good', 'defective']).default('good'),
});

export const networkSchema = z.object({
  qty: z.string().default('1'),
  serialNumber: z.string().optional().default(''),
  signalStatus: z.enum(['excellent', 'good', 'poor']).default('excellent'),
});

export const engineSchema = z.object({
  qty: z.string().default('1'),
  connectedEngines: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
});

export const solarSchema = z.object({
  qty: z.string().default('1'),
  installationLocation: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
  powerStatus: z.enum(['fully_charged', 'charging', 'operational']).default('fully_charged'),
});

export const signoffSchema = z.object({
  technicianName: z.string().optional().default(''),
  technicianDesignation: z.string().optional().default(''),
  signoffDate: z.string().optional().default(''),
  receiverName: z.string().optional().default(''),
  receiverDesignation: z.string().optional().default(''),
});

export const accountabilityFormSchema = z.object({
  vesselInfo: vesselInfoSchema,
  flsCapacitance: flsCapacitanceSchema,
  flsFloater: flsFloaterSchema,
  network: networkSchema,
  engine: engineSchema,
  solar: solarSchema,
  remarks: z.string().optional().default(''),
  signoff: signoffSchema.optional(),
  copyTypes: z.array(z.enum(['aimf', 'vessel', 'vessel_owner'])).min(1, 'Select at least one copy type'),
});

export type AccountabilityFormValues = z.input<typeof accountabilityFormSchema>;
