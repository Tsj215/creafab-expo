import { Readings } from '@/src/runtime/creality-snapshot';
import { DeviceRecord, DiscoverySession } from '@/src/runtime/types';

export type LiveRecord = {
  phase: 'connecting' | 'online' | 'offline';
  reason: string;
  readings: Readings | null;
};

export type RuntimeSnapshot = {
  ready: boolean;
  loadError: string | null;
  devices: DeviceRecord[];
  live: Record<string, LiveRecord>;
  discovery: DiscoverySession;
};

const EMPTY_DISCOVERY: DiscoverySession = {
  status: 'idle',
  subnet: '',
  completedCount: 0,
  total: 0,
  candidates: [],
  message: '',
};

let snapshot: RuntimeSnapshot = {
  ready: false,
  loadError: null,
  devices: [],
  live: {},
  discovery: EMPTY_DISCOVERY,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getSnapshot() {
  return snapshot;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function replaceDevices(devices: DeviceRecord[], live: Record<string, LiveRecord> = snapshot.live) {
  snapshot = { ...snapshot, devices, live };
  emit();
}

export function patchLive(id: string, record: LiveRecord) {
  snapshot = { ...snapshot, live: { ...snapshot.live, [id]: record } };
  emit();
}

export function removeLive(id: string) {
  if (!(id in snapshot.live)) return;
  const live = { ...snapshot.live };
  delete live[id];
  snapshot = { ...snapshot, live };
  emit();
}

export function markReady(loadError: string | null = null) {
  snapshot = { ...snapshot, ready: true, loadError };
  emit();
}

export function replaceDiscovery(discovery: DiscoverySession) {
  snapshot = { ...snapshot, discovery };
  emit();
}

export function patchDiscovery(patch: Partial<DiscoverySession>) {
  snapshot = { ...snapshot, discovery: { ...snapshot.discovery, ...patch } };
  emit();
}
