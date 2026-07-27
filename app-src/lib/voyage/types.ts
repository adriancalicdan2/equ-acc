export type ComponentCategory =
  | 'port-main-engine'
  | 'starboard-main-engine'
  | 'auxiliary-engine'
  | 'emergency-engine'
  | 'other';

export interface OperatingInterval {
  start: string;
  end: string;
  durationHours: number;
}

export interface ComponentSummary {
  name: string;
  category: ComponentCategory;
  workingHours: number;
  fuel: number;
  occurrences: number;
  intervals: OperatingInterval[];
}

export interface DailyLogRecord {
  source: 'excel' | 'manual';
  fileName: string;
  vesselName: string;
  date: string;
  location: string;
  activity: string;
  portHours: number;
  starboardHours: number;
  mainEngineFuel: number;
  auxiliaryEngineFuel: number;
  ancillaryFuel: number;
  totalFuel: number;
  components: ComponentSummary[];
  warnings: string[];
}

export interface VoyageDefinition {
  id: string;
  cycle: number;
  displayCycle: boolean;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  distance: number;
  averageSpeed: number;
  status?: 'planned' | 'underway' | 'paused' | 'completed' | 'aborted';
  source?: 'template' | 'manual' | 'suggested';
  confirmed?: boolean;
  interruptionReason?: string;
  mainEngineFuelOverride?: number | null;
  otherFuelOverride?: number | null;
  /** @deprecated Kept only so histories saved before the Other Fuel rule still load. */
  auxiliaryEngineFuelOverride?: number | null;
}

export interface ManualDailyLogInput {
  id: string;
  date: string;
  location: string;
  activity: string;
  portHours: number;
  starboardHours: number;
  mainEngineFuel: number;
  auxiliaryEngineFuel: number;
  otherFuel: number;
}
export interface VoyageResult extends VoyageDefinition {
  transitHours: number;
  mainEngineRunningHours: number;
  interruptionHours: number;
  mainEngineFuel: number;
  otherFuel: number;
  /** @deprecated Alias of otherFuel for histories created before the Other Fuel rule. */
  auxiliaryEngineFuel: number;
  totalFuel: number;
  averageBurn: number;
  fuelPerNauticalMile: number;
  warnings: string[];
}

export interface VoyageAnalysis {
  dailyLogs: DailyLogRecord[];
  voyages: VoyageResult[];
  warnings: string[];
}
