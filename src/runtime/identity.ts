import { resolveCrealityDisplayModel } from '@/src/runtime/creality-model';
import { compareIpv4 } from '@/src/runtime/net';
import { BAMBU_MQTT_PORT, CREALITY_WS_PORT, CrealityInfo, DeviceDriver, DeviceRecord } from '@/src/runtime/types';

const NAME_LIMIT = 64;

export function normalizeMac(value: string) {
  const hex = value.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (hex.length !== 12) return '';
  return hex.match(/.{2}/g)?.join(':') ?? '';
}

export function defaultDeviceName(info: CrealityInfo, ipAddress: string) {
  return (info.hostname || resolveCrealityDisplayModel(info.model) || `Creality ${ipAddress}`).slice(0, NAME_LIMIT);
}

export function createDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type RegisterDraft = {
  ipAddress: string;
  httpPort: number;
  info: CrealityInfo;
  name?: string;
  now: string;
  driver?: DeviceDriver;
  accessCode?: string;
  mqttPort?: number;
};

export type DeviceWritePlan = {
  saved: DeviceRecord;
  removeIds: string[];
};

function sameSerial(device: DeviceRecord, serialNumber: string) {
  return serialNumber !== '' && device.serialNumber === serialNumber;
}

function sameMac(device: DeviceRecord, mac: string) {
  return mac !== '' && normalizeMac(device.mac) === mac;
}

function sameAddress(device: DeviceRecord, draft: RegisterDraft) {
  return device.ipAddress === draft.ipAddress && device.httpPort === draft.httpPort;
}

function draftDriver(draft: RegisterDraft): DeviceDriver {
  return draft.driver ?? 'creality';
}

function sameDriver(device: DeviceRecord, draft: RegisterDraft) {
  return device.driver === draftDriver(draft);
}

function findMatch(devices: readonly DeviceRecord[], draft: RegisterDraft, mac: string) {
  const scoped = devices.filter((device) => sameDriver(device, draft));
  const serialNumber = draft.info.serialNumber.trim();
  if (serialNumber) {
    const bySerial = scoped.find((device) => sameSerial(device, serialNumber));
    if (bySerial) return bySerial;
  }
  if (mac) {
    const byMac = scoped.find((device) => sameMac(device, mac));
    if (byMac) return byMac;
  }
  return scoped.find((device) => sameAddress(device, draft));
}

function resolveName(existing: DeviceRecord | undefined, draft: RegisterDraft) {
  const custom = draft.name?.trim();
  if (custom) return custom.slice(0, NAME_LIMIT);
  if (existing) return existing.name;
  if (draftDriver(draft) === 'bambu') {
    return (draft.info.hostname || draft.info.model || `Bambu ${draft.ipAddress}`).slice(0, NAME_LIMIT);
  }
  return defaultDeviceName(draft.info, draft.ipAddress);
}

export function planDeviceUpsert(devices: readonly DeviceRecord[], draft: RegisterDraft): DeviceWritePlan {
  const mac = normalizeMac(draft.info.mac);
  const serialNumber = draft.info.serialNumber.trim();
  const existing = findMatch(devices, draft, mac);
  const driver = draftDriver(draft);
  const model = draft.info.model || existing?.model || (driver === 'bambu' ? '' : 'Creality');
  const saved: DeviceRecord = {
    id: existing?.id ?? createDeviceId(),
    name: resolveName(existing, draft),
    sortOrder: existing?.sortOrder ?? nextSortOrder(devices),
    driver,
    model,
    serialNumber: serialNumber || existing?.serialNumber || '',
    mac: mac || normalizeMac(existing?.mac ?? ''),
    ipAddress: draft.ipAddress,
    httpPort: draft.httpPort,
    wsPort: driver === 'creality' ? CREALITY_WS_PORT : 0,
    accessCode: (draft.accessCode ?? existing?.accessCode ?? '').trim(),
    mqttPort: draft.mqttPort ?? existing?.mqttPort ?? BAMBU_MQTT_PORT,
    firmware: draft.info.firmware || existing?.firmware || '',
    createdAt: existing?.createdAt ?? draft.now,
    updatedAt: draft.now,
  };
  const removeIds = devices
    .filter(
      (device) =>
        device.id !== saved.id &&
        device.driver === saved.driver &&
        (sameSerial(device, saved.serialNumber) || sameMac(device, saved.mac) || sameAddress(device, draft)),
    )
    .map((device) => device.id);

  return { saved, removeIds };
}

function nextSortOrder(devices: readonly DeviceRecord[]) {
  return devices.reduce((max, device) => Math.max(max, device.sortOrder), 0) + 1;
}

export function applyDevicePlan(devices: readonly DeviceRecord[], plan: DeviceWritePlan) {
  const removed = new Set(plan.removeIds);
  const next = devices.filter((device) => device.id !== plan.saved.id && !removed.has(device.id));
  next.push(plan.saved);
  next.sort((left, right) => left.sortOrder - right.sortOrder || compareIpv4(left.ipAddress, right.ipAddress));
  return next;
}
