export type CopyType = 'aimf' | 'vessel' | 'vessel_owner';

export type CalibrationStatus = 'good' | 'defective';
export type SignalStatus = 'excellent' | 'good' | 'poor';
export type PowerStatus = 'fully_charged' | 'charging' | 'operational';

export interface VesselInfo {
  vesselName: string;
  installationDate: string;
  leadEngineer: string;
}

export interface FlsCapacitanceRow {
  qty: string;
  tankAssigned: string;
  serialNumber: string;
  calibrationStatus: CalibrationStatus;
}

export interface FlsFloaterRow {
  qty: string;
  tankAssigned: string;
  serialNumber: string;
  calibrationStatus: CalibrationStatus;
}

export interface NetworkRow {
  qty: string;
  serialNumber: string;
  signalStatus: SignalStatus;
}

export interface EngineRow {
  qty: string;
  connectedEngines: string;
  serialNumber: string;
}

export interface SolarRow {
  qty: string;
  installationLocation: string;
  serialNumber: string;
  powerStatus: PowerStatus;
}

export interface SignoffInfo {
  technicianName: string;
  technicianDesignation: string;
  signoffDate: string;
  receiverName: string;
  receiverDesignation: string;
}

export interface SectionPhotos {
  fls: FileList | null;
  network: FileList | null;
  engine: FileList | null;
  solar: FileList | null;
}

export interface AccountabilityFormData {
  vesselInfo: VesselInfo;
  flsCapacitance: FlsCapacitanceRow;
  flsFloater: FlsFloaterRow;
  network: NetworkRow;
  engine: EngineRow;
  solar: SolarRow;
  remarks: string;
  signoff: SignoffInfo;
  copyTypes: CopyType[];
}

export interface TemplateData {
  vesselName: string;
  installationDate: string;
  leadEngineer: string;
  // FLS Capacitance
  flsCapacitanceQty: string;
  flsCapacitanceTank: string;
  flsCapacitanceSN: string;
  flsCapacitanceStatus: string;
  // FLS Floater
  flsFloaterQty: string;
  flsFloaterTank: string;
  flsFloaterSN: string;
  flsFloaterStatus: string;
  // Network
  networkQty: string;
  networkSN: string;
  networkSignalStatus: string;
  // Engine
  engineQty: string;
  engineConnected: string;
  engineSN: string;
  // Solar
  solarQty: string;
  solarLocation: string;
  solarSN: string;
  solarPowerStatus: string;
  // Remarks
  remarks: string;
  // Signoff
  techName: string;
  techDesignation: string;
  signoffDate: string;
  receiverName: string;
  receiverDesignation: string;
}

export interface PhotoSet {
  flsPhotos: Buffer[];
  networkPhotos: Buffer[];
  enginePhotos: Buffer[];
  solarPhotos: Buffer[];
}
