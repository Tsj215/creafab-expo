export type PrinterStatus =
  | 'printing'
  | 'paused'
  | 'standby'
  | 'heating'
  | 'error'
  | 'completed'
  | 'connecting'
  | 'offline';

export type PrintJobCard = {
  fileName: string;
  thumbnailUrl: string;
  progressPercent: number;
  currentLayer: number;
  totalLayers: number;
  timeRemainingSec: number;
  filamentType: string;
  speedMmS: number;
  layerHeight: number;
};

export type PrinterCard = {
  id: string;
  name: string;
  driver: 'creality' | 'bambu';
  model: string;
  modelCode: string;
  ipAddress: string;
  port: number;
  macAddress: string;
  status: PrinterStatus;
  firmwareVersion: string;
  osVersion: string;
  pingLatencyMs: number;
  nozzle: { current: number; target: number };
  bed: { current: number; target: number };
  chamber?: { current: number; target: number };
  filamentOk: boolean;
  job: PrintJobCard | null;
  connectionNote: string;
};

export type ViewMode = 'detailed' | 'compact';
export type StatusFilter = 'all' | 'printing' | 'heating' | 'standby';
export type SortOrder = 'default' | 'progress-desc' | 'status' | 'model';
