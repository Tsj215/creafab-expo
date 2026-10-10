import { closeBambuSession, openBambuSession, readBambuSession } from '@/src/runtime/bambu-lan';
import { probeCreality, ProbeError } from '@/src/runtime/creality-info';
import { crealitySocketUrl, openCrealitySession } from '@/src/runtime/creality-session';
import { deleteDevice, listDevices, persistDevice } from '@/src/runtime/db';
import { applyDevicePlan, planDeviceUpsert, RegisterDraft } from '@/src/runtime/identity';
import { readLanSubnet } from '@/src/runtime/lan';
import { compareIpv4, formatIpv4, isPrivateIpv4, parsePort, resolveScanHosts, ScanSegments } from '@/src/runtime/net';
import { getSnapshot, LiveRecord, markReady, patchDiscovery, patchLive, removeLive, replaceDevices, replaceDiscovery } from '@/src/runtime/store';
import {
  Candidate,
  CONNECT_CONCURRENCY,
  CREALITY_HTTP_PORT,
  CREALITY_WS_PORT,
  CrealityInfo,
  DeviceRecord,
  MANUAL_PROBE_TIMEOUT_MS,
  SCAN_CONCURRENCY,
  SCAN_PROBE_TIMEOUT_MS,
} from '@/src/runtime/types';

let opening: Promise<void> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();
let scanGeneration = 0;
let scanAbort: AbortController | null = null;
let scanAddress = '';
const sessions = new Map<string, { close: () => void }>();
const bambuPolls = new Map<string, ReturnType<typeof setInterval>>();
const bambuOpening = new Set<string>();

function connectingRecord(): LiveRecord {
  return { phase: 'connecting', reason: '', readings: null };
}

function enqueue<T>(task: () => Promise<T>) {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function ensureRuntime() {
  if (!opening) {
    opening = listDevices()
      .then((devices) => {
        const live = Object.fromEntries(devices.map((device) => [device.id, connectingRecord()]));
        replaceDevices(devices, live);
        markReady(null);
        void connectQueued(devices);
      })
      .catch((error: unknown) => {
        opening = null;
        markReady(error instanceof Error ? error.message : '设备档案读取失败');
      });
  }
  return opening;
}

export async function prepareScan() {
  const lan = await readLanSubnet();
  if ('error' in lan) {
    scanAddress = '';
    if (getSnapshot().discovery.status === 'running') stopScan();
    replaceDiscovery({
      status: 'idle',
      subnet: '',
      completedCount: 0,
      total: 0,
      candidates: [],
      message: lan.error,
    });
    return { address: '', message: lan.error };
  }

  scanAddress = lan.address;
  if (getSnapshot().discovery.status !== 'running') {
    replaceDiscovery({
      status: 'idle',
      subnet: '',
      completedCount: 0,
      total: 0,
      candidates: [],
      message: '',
    });
  }
  return { address: lan.address, message: '' };
}

export function stopScan() {
  scanAbort?.abort();
  scanAbort = null;
  scanGeneration += 1;
  if (getSnapshot().discovery.status === 'running') {
    patchDiscovery({ status: 'stopped', message: '扫描已停止' });
  }
}

export async function startScan(segments: ScanSegments): Promise<{ ok: true } | { ok: false; message: string }> {
  const resolved = resolveScanHosts(segments, scanAddress);
  if ('error' in resolved) return { ok: false as const, message: resolved.error };

  stopScan();
  const token = ++scanGeneration;
  const abort = new AbortController();
  scanAbort = abort;
  const hosts = resolved.hosts;
  const total = hosts.length;
  replaceDiscovery({
    status: 'running',
    subnet: resolved.label,
    completedCount: 0,
    total,
    candidates: [],
    message: '正在扫描局域网',
  });

  let completedCount = 0;
  let candidates: Candidate[] = [];

  const workers = Array.from({ length: Math.min(SCAN_CONCURRENCY, hosts.length) }, async () => {
    while (!abort.signal.aborted && token === scanGeneration) {
      const ipAddress = hosts.shift();
      if (!ipAddress) return;
      let cancelled = false;
      try {
        const info = await probeCreality(ipAddress, CREALITY_HTTP_PORT, abort.signal, SCAN_PROBE_TIMEOUT_MS);
        if (token !== scanGeneration || abort.signal.aborted) {
          cancelled = true;
        } else {
          candidates = insertCandidate(candidates, { ipAddress, httpPort: CREALITY_HTTP_PORT, info });
          patchDiscovery({
            candidates,
            message: `正在扫描，已发现 ${candidates.length} 台`,
          });
        }
      } catch (error) {
        cancelled = error instanceof ProbeError && error.reason === 'cancelled';
      } finally {
        if (!cancelled && token === scanGeneration && !abort.signal.aborted) {
          completedCount += 1;
          patchDiscovery({ completedCount });
        }
      }
      if (cancelled) return;
    }
  });

  await Promise.all(workers);
  if (token !== scanGeneration) return { ok: true as const };
  scanAbort = null;
  const found = getSnapshot().discovery.candidates.length;
  patchDiscovery({
    status: 'completed',
    completedCount: total,
    message: found > 0 ? `扫描完成，发现 ${found} 台` : '扫描完成，未发现创想设备',
  });
  return { ok: true as const };
}

function insertCandidate(candidates: Candidate[], candidate: Candidate) {
  const next = candidates.filter((item) => item.ipAddress !== candidate.ipAddress);
  next.push(candidate);
  next.sort((left, right) => compareIpv4(left.ipAddress, right.ipAddress));
  return next;
}

export function probeManual(ipAddress: string, portText: string) {
  const ip = formatIpv4(ipAddress);
  if (!ip || !isPrivateIpv4(ip)) {
    return Promise.reject(new ProbeError('invalid', '请输入局域网 IPv4 地址'));
  }
  const httpPort = parsePort(portText, CREALITY_HTTP_PORT);
  if (httpPort === null) {
    return Promise.reject(new ProbeError('invalid', '端口需要在 1 到 65535 之间'));
  }
  return probeCreality(ip, httpPort, undefined, MANUAL_PROBE_TIMEOUT_MS).then((info) => ({
    ipAddress: ip,
    httpPort,
    info,
  }));
}

export function registerCandidate(input: { ipAddress: string; httpPort: number; info: CrealityInfo; name?: string }) {
  const ipAddress = formatIpv4(input.ipAddress);
  const draft: RegisterDraft = {
    ipAddress: ipAddress ?? input.ipAddress.trim(),
    httpPort: input.httpPort,
    info: {
      ...input.info,
      mac: input.info.mac,
      serialNumber: input.info.serialNumber.trim(),
    },
    name: input.name,
    now: new Date().toISOString(),
  };

  return enqueue(async () => {
    if (!isPrivateIpv4(draft.ipAddress)) {
      throw new ProbeError('invalid', '请输入局域网 IPv4 地址');
    }
    const existingIds = new Set(getSnapshot().devices.map((device) => device.id));
    const plan = planDeviceUpsert(getSnapshot().devices, draft);
    await persistDevice(plan.saved, plan.removeIds);
    for (const id of plan.removeIds) closeSession(id);
    const live = { ...getSnapshot().live };
    for (const id of plan.removeIds) delete live[id];
    live[plan.saved.id] = connectingRecord();
    replaceDevices(applyDevicePlan(getSnapshot().devices, plan), live);
    void connectDevice(plan.saved.id);
    return { device: plan.saved, created: !existingIds.has(plan.saved.id) };
  });
}

export function registerBambu(input: {
  ipAddress: string;
  mqttPort: number;
  serialNumber: string;
  accessCode: string;
  model: string;
  name?: string;
  firmware?: string;
}) {
  return enqueue(async () => {
    const ipAddress = formatIpv4(input.ipAddress);
    if (!ipAddress || !isPrivateIpv4(ipAddress)) {
      throw new ProbeError('invalid', '请输入局域网 IPv4 地址');
    }
    const serialNumber = input.serialNumber.trim();
    const accessCode = input.accessCode.trim();
    if (!serialNumber || !accessCode) {
      throw new ProbeError('invalid', '缺少序列号或访问码');
    }
    if (!Number.isInteger(input.mqttPort) || input.mqttPort < 1 || input.mqttPort > 65535) {
      throw new ProbeError('invalid', 'MQTT 端口需在 1 到 65535 之间');
    }
    const existingIds = new Set(getSnapshot().devices.map((device) => device.id));
    const plan = planDeviceUpsert(getSnapshot().devices, {
      ipAddress,
      httpPort: 0,
      mqttPort: input.mqttPort,
      accessCode,
      driver: 'bambu',
      info: {
        mac: '',
        model: input.model,
        serialNumber,
        firmware: input.firmware ?? '',
        hostname: input.name?.trim() ?? '',
      },
      name: input.name,
      now: new Date().toISOString(),
    });
    await persistDevice(plan.saved, plan.removeIds);
    for (const id of plan.removeIds) releaseLink(id);
    const live = { ...getSnapshot().live };
    for (const id of plan.removeIds) delete live[id];
    live[plan.saved.id] = connectingRecord();
    replaceDevices(applyDevicePlan(getSnapshot().devices, plan), live);
    void connectDevice(plan.saved.id);
    return { device: plan.saved, created: !existingIds.has(plan.saved.id) };
  });
}

export function connectDevice(id: string) {
  const device = getSnapshot().devices.find((item) => item.id === id);
  if (!device) return Promise.resolve();
  if (device.driver === 'bambu') {
    patchLive(id, connectingRecord());
    watchBambu(device);
    return Promise.resolve();
  }
  closeSession(id);
  patchLive(id, connectingRecord());
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const handle = openCrealitySession({
      url: crealitySocketUrl(device.ipAddress, device.wsPort || CREALITY_WS_PORT),
      onSnapshot: (readings) => {
        if (!getSnapshot().devices.some((item) => item.id === id)) return;
        patchLive(id, { phase: 'online', reason: '', readings });
        done();
      },
      onFailed: (reason) => {
        sessions.delete(id);
        if (getSnapshot().devices.some((item) => item.id === id)) {
          patchLive(id, { phase: 'offline', reason, readings: null });
        }
        done();
      },
    });
    sessions.set(id, {
      close() {
        handle.close();
        done();
      },
    });
  });
}

export function removeDevice(id: string) {
  return enqueue(async () => {
    releaseLink(id);
    removeLive(id);
    await deleteDevice(id);
    replaceDevices(getSnapshot().devices.filter((device) => device.id !== id));
  });
}

function closeSession(id: string) {
  const session = sessions.get(id);
  sessions.delete(id);
  session?.close();
}

function watchBambu(device: DeviceRecord) {
  void syncBambu(device, 'open');
  if (bambuPolls.has(device.id)) return;
  const timer = setInterval(() => {
    const current = getSnapshot().devices.find((item) => item.id === device.id);
    if (!current || current.driver !== 'bambu') {
      stopBambuWatch(device.id);
      return;
    }
    void syncBambu(current, 'read');
  }, 2000);
  bambuPolls.set(device.id, timer);
}

function stopBambuWatch(id: string) {
  const timer = bambuPolls.get(id);
  if (timer) clearInterval(timer);
  bambuPolls.delete(id);
  void closeBambuSession(id);
}

function releaseLink(id: string) {
  const device = getSnapshot().devices.find((item) => item.id === id);
  closeSession(id);
  if (device?.driver === 'bambu' || bambuPolls.has(id)) stopBambuWatch(id);
}

async function syncBambu(device: DeviceRecord, action: 'open' | 'read') {
  if (action === 'open' && bambuOpening.has(device.id)) return;
  if (action === 'open') bambuOpening.add(device.id);
  try {
    const live = action === 'open' ? await openBambuSession(device) : await readBambuSession(device.id);
    if (!getSnapshot().devices.some((item) => item.id === device.id)) return;
    if (action === 'read' && !live.present) {
      void syncBambu(device, 'open');
      return;
    }
    patchLive(device.id, live);
  } catch {
    if (action === 'read' || !getSnapshot().devices.some((item) => item.id === device.id)) return;
    patchLive(device.id, { phase: 'offline', reason: '连接已断开', readings: null });
  } finally {
    if (action === 'open') bambuOpening.delete(device.id);
  }
}

async function connectQueued(devices: readonly DeviceRecord[]) {
  const pending = [...devices];
  const workers = Array.from({ length: Math.min(CONNECT_CONCURRENCY, pending.length) }, async () => {
    while (pending.length > 0) {
      const device = pending.shift();
      if (!device || !getSnapshot().devices.some((item) => item.id === device.id)) continue;
      await connectDevice(device.id);
    }
  });
  await Promise.all(workers);
}
