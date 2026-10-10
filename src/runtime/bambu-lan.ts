/**
 * 拓竹局域网传输缝。
 *
 * creafab-one 在本机用 TLS 读取 8883 证书上的序列号，再用 MQTT 3.1.1
 * （用户名 bblp、密码为访问码）订阅 device/{sn}/report，并向 device/{sn}/request
 * 发送 get_version 与 pushall。收到首条状态回报才算握手成功，失败不写档案。
 *
 * Expo Go 没有原始 TLS 套接字，识别、握手和后续会话都由开发机代连 8883。
 * 添加成功后会话保持打开，应用轮询 gcode_state 等状态。失败不写档案。
 */
import Constants from 'expo-constants';

import {
  BAMBU_IDENTIFY_FAILED_MESSAGE,
  BAMBU_MQTT_FAILED_MESSAGE,
  BambuHostIdentity,
  BambuMqttHandshake,
  readBambuMqttPort,
} from '@/src/runtime/bambu-add';
import type { Readings } from '@/src/runtime/creality-snapshot';
import { isPrivateIpv4 } from '@/src/runtime/net';
import type { LiveRecord } from '@/src/runtime/store';
import { BAMBU_AUTH_USERNAME, BAMBU_MQTT_PORT, type DeviceRecord } from '@/src/runtime/types';

export { BAMBU_AUTH_USERNAME, BAMBU_MQTT_PORT };

export const BAMBU_MQTT_PROTOCOL_VERSION = 4;

export function bambuReportTopic(serialNumber: string) {
  return `device/${serialNumber}/report`;
}

export function bambuRequestTopic(serialNumber: string) {
  return `device/${serialNumber}/request`;
}

export const BAMBU_PUSHALL_PAYLOAD = JSON.stringify({ pushing: { command: 'pushall' } });

export const BAMBU_IDENTIFY_UNAVAILABLE_MESSAGE = '当前应用还不能读取拓竹 8883 证书。请先手动填写序列号。';
export const BAMBU_MQTT_UNAVAILABLE_MESSAGE = '当前应用还不能完成拓竹 MQTT 握手，设备不会被保存。';
export const BAMBU_SESSION_UNAVAILABLE_MESSAGE = '当前应用还不能保持拓竹 MQTT 会话。';

function devServerBase() {
  const expoGo = Constants.expoGoConfig as { debuggerHost?: string } | null;
  const hostUri = Constants.expoConfig?.hostUri?.trim() || expoGo?.debuggerHost?.trim() || '';
  const host = hostUri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0];
  return host ? `http://${host}` : '';
}

export async function identifyBambuHost(input: {
  ipAddress: string;
  mqttPort?: string;
  signal?: AbortSignal;
}): Promise<BambuHostIdentity> {
  const ipAddress = input.ipAddress.trim();
  const mqttPort = readBambuMqttPort(input.mqttPort) ?? BAMBU_MQTT_PORT;
  if (!isPrivateIpv4(ipAddress)) {
    throw new Error('请输入局域网 IPv4 地址');
  }
  const base = devServerBase();
  if (!base) {
    throw new Error(BAMBU_IDENTIFY_UNAVAILABLE_MESSAGE);
  }
  const url = `${base}/__creafab/bambu-identify?ip=${encodeURIComponent(ipAddress)}&port=${mqttPort}`;
  const response = await fetch(url, { signal: input.signal });
  if (!response.ok) {
    throw new Error(BAMBU_IDENTIFY_FAILED_MESSAGE);
  }
  const body = (await response.json()) as { serialNumber?: string };
  const serialNumber = body.serialNumber?.trim() ?? '';
  if (!serialNumber) {
    throw new Error(BAMBU_IDENTIFY_FAILED_MESSAGE);
  }
  return {
    ipAddress,
    mqttPort,
    reachable: true,
    serialNumber,
    model: '',
    name: '',
    version: '',
    discoverySource: 'tls-cert',
  };
}

export async function testBambuLanConnection(input: {
  ipAddress: string;
  serialNumber: string;
  accessCode: string;
  mqttPort?: string;
}): Promise<BambuMqttHandshake> {
  const base = devServerBase();
  if (!base) {
    return { ok: false, message: BAMBU_MQTT_UNAVAILABLE_MESSAGE };
  }
  const mqttPort = readBambuMqttPort(input.mqttPort) ?? BAMBU_MQTT_PORT;
  try {
    const response = await fetch(`${base}/__creafab/bambu-mqtt-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: input.ipAddress.trim(),
        port: mqttPort,
        serialNumber: input.serialNumber.trim(),
        accessCode: input.accessCode,
      }),
    });
    const body = (await response.json()) as BambuMqttHandshake;
    if (!body.ok) {
      return { ok: false, message: body.message || BAMBU_MQTT_FAILED_MESSAGE };
    }
    return {
      ok: true,
      serialNumber: body.serialNumber?.trim() || input.serialNumber.trim(),
      model: body.model?.trim() || '',
      firmware: body.firmware?.trim() || '',
    };
  } catch {
    return { ok: false, message: BAMBU_MQTT_FAILED_MESSAGE };
  }
}

function asReadings(value: unknown): Readings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Readings>;
  const nozzle = raw.nozzle;
  const bed = raw.bed;
  return {
    stateCode: typeof raw.stateCode === 'number' ? raw.stateCode : null,
    nozzle: {
      current: typeof nozzle?.current === 'number' ? nozzle.current : 0,
      target: typeof nozzle?.target === 'number' ? nozzle.target : 0,
    },
    bed: {
      current: typeof bed?.current === 'number' ? bed.current : 0,
      target: typeof bed?.target === 'number' ? bed.target : 0,
    },
    progress: typeof raw.progress === 'number' ? raw.progress : null,
    taskName: typeof raw.taskName === 'string' ? raw.taskName : '',
    remainingSec: typeof raw.remainingSec === 'number' ? raw.remainingSec : null,
    currentLayer: typeof raw.currentLayer === 'number' ? raw.currentLayer : null,
    totalLayers: typeof raw.totalLayers === 'number' ? raw.totalLayers : null,
  };
}

export type BambuSessionState = LiveRecord & { present: boolean };

async function postBambuSession(body: Record<string, unknown>): Promise<BambuSessionState> {
  const base = devServerBase();
  if (!base) {
    return { phase: 'offline', reason: BAMBU_SESSION_UNAVAILABLE_MESSAGE, readings: null, present: true };
  }
  const response = await fetch(`${base}/__creafab/bambu-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { phase?: string; reason?: string; readings?: unknown; present?: boolean };
  const phase = payload.phase === 'online' || payload.phase === 'connecting' ? payload.phase : 'offline';
  return {
    phase,
    reason: typeof payload.reason === 'string' ? payload.reason : '',
    readings: phase === 'online' ? asReadings(payload.readings) : null,
    present: payload.present !== false,
  };
}

export function openBambuSession(device: DeviceRecord) {
  return postBambuSession({
    action: 'open',
    deviceId: device.id,
    ip: device.ipAddress,
    port: device.mqttPort || BAMBU_MQTT_PORT,
    serialNumber: device.serialNumber,
    accessCode: device.accessCode,
  });
}

export function readBambuSession(deviceId: string) {
  return postBambuSession({ action: 'read', deviceId });
}

export function closeBambuSession(deviceId: string) {
  return postBambuSession({ action: 'close', deviceId }).catch(() => undefined);
}
