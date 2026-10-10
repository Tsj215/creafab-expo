import { resolveCrealityDisplayModel } from '@/src/runtime/creality-model';
import { Readings } from '@/src/runtime/creality-snapshot';
import { LiveRecord } from '@/src/runtime/store';
import { DeviceRecord } from '@/src/runtime/types';
import { PrinterCard, PrinterStatus } from '@/src/types/printer';

export function toPrinterCard(device: DeviceRecord, live: LiveRecord | undefined): PrinterCard {
  const phase = live?.phase ?? 'offline';
  const readings = phase === 'online' ? live?.readings ?? null : null;
  const status = phase === 'connecting' ? 'connecting' : phase === 'online' ? machineStatus(readings) : 'offline';
  const job = readings && hasJob(status, readings) ? toJob(readings) : null;

  return {
    id: device.id,
    name: device.name,
    driver: device.driver,
    model: device.driver === 'bambu' ? device.model : resolveCrealityDisplayModel(device.model) || device.model,
    modelCode: device.model,
    ipAddress: device.ipAddress,
    port: device.driver === 'bambu' ? device.mqttPort : device.httpPort,
    macAddress: device.mac,
    status,
    firmwareVersion: device.firmware,
    osVersion: '',
    pingLatencyMs: 0,
    nozzle: readings?.nozzle ?? { current: 0, target: 0 },
    bed: readings?.bed ?? { current: 0, target: 0 },
    filamentOk: status !== 'offline' && status !== 'connecting',
    job,
    connectionNote: phase === 'offline' ? live?.reason ?? '' : '',
  };
}

function machineStatus(readings: Readings | null): PrinterStatus {
  const state = readings?.stateCode ?? null;
  if (state === 1 || state === 7 || state === 8 || state === 9) return 'printing';
  if (state === 5 || state === 6) return 'paused';
  if (state === 2) return 'completed';
  if (state === 3) return 'error';
  const nozzleHeating = !!readings && readings.nozzle.target > 0 && readings.nozzle.current + 3 < readings.nozzle.target;
  const bedHeating = !!readings && readings.bed.target > 0 && readings.bed.current + 3 < readings.bed.target;
  if ((nozzleHeating || bedHeating) && (state === null || state === 0 || state === 4)) return 'heating';
  return 'standby';
}

function hasJob(status: PrinterStatus, readings: Readings) {
  if (status !== 'printing' && status !== 'paused' && status !== 'heating' && status !== 'completed') return false;
  return Boolean(readings.taskName) || readings.progress !== null;
}

function toJob(readings: Readings) {
  return {
    fileName: readings.taskName || '未命名任务',
    thumbnailUrl: '',
    progressPercent: readings.progress ?? 0,
    currentLayer: readings.currentLayer ?? 0,
    totalLayers: readings.totalLayers ?? 0,
    timeRemainingSec: readings.remainingSec ?? 0,
    filamentType: '',
    speedMmS: 0,
    layerHeight: 0,
  };
}
