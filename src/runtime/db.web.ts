import { compareIpv4 } from '@/src/runtime/net';
import { DeviceRecord } from '@/src/runtime/types';

const STORAGE_KEY = 'creafab.devices';

function normalizeRow(row: DeviceRecord): DeviceRecord {
  return {
    ...row,
    driver: row.driver === 'bambu' ? 'bambu' : 'creality',
    accessCode: row.accessCode ?? '',
    mqttPort: row.mqttPort || 8883,
  };
}

function readAll(): DeviceRecord[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DeviceRecord[]).map(normalizeRow) : [];
  } catch {
    return [];
  }
}

function writeAll(devices: DeviceRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

export async function listDevices() {
  return readAll()
    .filter((row) => row.driver === 'creality' || row.driver === 'bambu')
    .sort((left, right) => left.sortOrder - right.sortOrder || compareIpv4(left.ipAddress, right.ipAddress));
}

export async function persistDevice(device: DeviceRecord, removeIds: readonly string[]) {
  const removed = new Set(removeIds);
  const devices = readAll().filter((row) => row.id !== device.id && !removed.has(row.id));
  devices.push(normalizeRow(device));
  writeAll(devices);
}

export async function deleteDevice(id: string) {
  writeAll(readAll().filter((row) => row.id !== id));
}
