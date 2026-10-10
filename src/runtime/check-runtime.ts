import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createTlsServer } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

import {
  BAMBU_IDENTIFY_FAILED_MESSAGE,
  BambuAddApis,
  BambuHostIdentity,
  canSubmitBambuManualAdd,
  runBambuManualConnectionTest,
} from '@/src/runtime/bambu-add';
import { crealityInfoUrl, parseCrealityInfo, ProbeError } from '@/src/runtime/creality-info';
import { applyDevicePlan, normalizeMac, planDeviceUpsert } from '@/src/runtime/identity';
import { buildScanHosts, defaultScanSegments, formatIpv4, isPrivateIpv4, parsePort, resolveScanHosts } from '@/src/runtime/net';
import { applyPinnedDeviceOrder, pinDeviceId, unpinDeviceId } from '@/src/runtime/device-order';
import { crealityThumbnailFile } from '@/src/runtime/creality-thumbnail';
import { resolveCrealityDisplayModel } from '@/src/runtime/creality-model';
import type { Readings } from '@/src/runtime/creality-snapshot';
import { toPrinterCard } from '@/src/runtime/project';
import { parseBambuScreen } from '@/src/runtime/bambu-screen';
import { DEVICE_BRANDS } from '@/src/runtime/brands';
import { parseCrealityScreen } from '@/src/runtime/creality-screen';
import { CrealityInfo, DeviceRecord } from '@/src/runtime/types';

const NOW = '2026-09-29T02:00:00.000Z';

function info(patch: Partial<CrealityInfo> = {}): CrealityInfo {
  return {
    mac: 'FCEE25006094',
    model: 'F022',
    serialNumber: 'SN1',
    firmware: '1.0.0',
    hostname: 'I7-测试',
    ...patch,
  };
}

function device(patch: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    id: 'a',
    name: '旧名称',
    sortOrder: 1,
    driver: 'creality',
    model: 'F018',
    serialNumber: '',
    mac: '',
    ipAddress: '192.168.1.10',
    httpPort: 80,
    wsPort: 9999,
    accessCode: '',
    mqttPort: 8883,
    firmware: '',
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function bambuIdentity(patch: Partial<BambuHostIdentity> = {}): BambuHostIdentity {
  return {
    ipAddress: '192.168.1.20',
    mqttPort: 8883,
    reachable: true,
    serialNumber: '01P00A000000001',
    model: 'X1C',
    name: '',
    version: '01.07.00.00',
    discoverySource: 'tls-cert',
    ...patch,
  };
}

test('创想 /info 解析序列号、型号和主机名', () => {
  assert.deepEqual(
    parseCrealityInfo({ mac: 'FCEE25006094', model: 'F022', version: '1.0.0', hostname: 'I7-测试2' }),
    info({ serialNumber: '', hostname: 'I7-测试2' }),
  );
});

test('没有 hostname 的创想 /info 仍可识别', () => {
  assert.deepEqual(
    parseCrealityInfo({
      mac: 'FCEE2815C138',
      model: 'F039',
      sn: '4322572815C138',
      version: '1.0.0',
      videoPort: 443,
      wssPort: 443,
    }),
    {
      mac: 'FCEE2815C138',
      model: 'F039',
      serialNumber: '4322572815C138',
      firmware: '1.0.0',
      hostname: '',
    },
  );
});

test('没有身份字段的响应不当成打印机', () => {
  assert.throws(() => parseCrealityInfo({}), ProbeError);
  assert.throws(() => parseCrealityInfo([]), ProbeError);
});

test('80 端口不写进 URL', () => {
  assert.equal(crealityInfoUrl('192.168.1.8', 80), 'http://192.168.1.8/info');
  assert.equal(crealityInfoUrl('192.168.1.8', 8080), 'http://192.168.1.8:8080/info');
});

test('只接受私网 IPv4，端口空值回落到 80', () => {
  assert.equal(isPrivateIpv4('192.168.1.8'), true);
  assert.equal(isPrivateIpv4('10.1.2.3'), true);
  assert.equal(isPrivateIpv4('172.16.0.1'), true);
  assert.equal(isPrivateIpv4('172.15.0.1'), false);
  assert.equal(isPrivateIpv4('8.8.8.8'), false);
  assert.equal(isPrivateIpv4('192.168.1'), false);
  assert.equal(parsePort('', 80), 80);
  assert.equal(parsePort('0', 80), null);
  assert.equal(parsePort('4408', 80), 4408);
  assert.equal(formatIpv4('192.168.001.010'), '192.168.1.10');
});

test('扫描跳过本机地址', () => {
  const hosts = buildScanHosts('192.168.1', '192.168.1.20');
  assert.equal(hosts.length, 253);
  assert.equal(hosts.includes('192.168.1.20'), false);
  assert.equal(hosts[0], '192.168.1.1');
});

test('扫描网段前三段有默认值，末段可收窄范围', () => {
  assert.deepEqual(defaultScanSegments('172.18.171.177'), { a: '172', b: '18', c: '171', d: '' });
  assert.deepEqual(defaultScanSegments(''), { a: '192', b: '168', c: '1', d: '' });

  const other = resolveScanHosts({ a: '172', b: '18', c: '170', d: '' }, '172.18.171.177');
  assert.ok(!('error' in other));
  if ('error' in other) return;
  assert.equal(other.label, '172.18.170.0/24');
  assert.equal(other.hosts.length, 254);
  assert.equal(other.hosts.includes('172.18.170.163'), true);

  const narrowed = resolveScanHosts({ a: '192', b: '168', c: '1', d: '10-12' }, '192.168.1.20');
  assert.ok(!('error' in narrowed));
  if ('error' in narrowed) return;
  assert.deepEqual(narrowed.hosts, ['192.168.1.10', '192.168.1.11', '192.168.1.12']);

  const skipped = resolveScanHosts({ a: '192', b: '168', c: '1', d: '20' }, '192.168.1.20');
  assert.deepEqual(skipped, { error: '这个范围内没有可扫描的地址' });
  assert.equal('error' in resolveScanHosts({ a: '172', b: '18', c: '', d: '' }, ''), true);
  assert.equal('error' in resolveScanHosts({ a: '8', b: '8', c: '8', d: '' }, ''), true);
});

test('同一序列号更新 IP，并删掉同地址上的空档案', () => {
  const known = device({ id: 'known', serialNumber: 'SN1', mac: 'fc:ee:25:00:60:94', ipAddress: '192.168.1.10' });
  const ghost = device({ id: 'ghost', ipAddress: '192.168.1.11' });
  const plan = planDeviceUpsert([known, ghost], {
    ipAddress: '192.168.1.11',
    httpPort: 80,
    info: info(),
    now: '2026-09-29T03:00:00.000Z',
  });

  assert.equal(plan.saved.id, 'known');
  assert.equal(plan.saved.ipAddress, '192.168.1.11');
  assert.equal(plan.saved.name, '旧名称');
  assert.deepEqual(plan.removeIds, ['ghost']);
  assert.deepEqual(
    applyDevicePlan([known, ghost], plan).map((item) => item.id),
    ['known'],
  );
});

test('没有序列号时按 MAC 合并，并补上后来的序列号', () => {
  const known = device({ mac: 'fc:ee:25:00:60:94' });
  const plan = planDeviceUpsert([known], {
    ipAddress: '192.168.1.30',
    httpPort: 80,
    info: info({ mac: 'FC:EE:25:00:60:94' }),
    now: NOW,
  });
  assert.equal(plan.saved.id, 'a');
  assert.equal(plan.saved.serialNumber, 'SN1');
  assert.equal(plan.saved.ipAddress, '192.168.1.30');
  assert.equal(normalizeMac('FCEE25006094'), 'fc:ee:25:00:60:94');
});

test('手动名称会覆盖，扫描再次登记保留原名', () => {
  const known = device({ serialNumber: 'SN1', name: '工位机' });
  const renamed = planDeviceUpsert([known], {
    ipAddress: '192.168.1.10',
    httpPort: 80,
    info: info({ hostname: '别的名字' }),
    name: '  新备注  ',
    now: NOW,
  });
  assert.equal(renamed.saved.name, '新备注');

  const kept = planDeviceUpsert([known], {
    ipAddress: '192.168.1.10',
    httpPort: 80,
    info: info({ hostname: '别的名字' }),
    now: NOW,
  });
  assert.equal(kept.saved.name, '工位机');
});

test('创想快照合并增量，心跳不覆盖', async () => {
  const { applyCrealityMessage } = await import('@/src/runtime/creality-snapshot');
  const first = applyCrealityMessage(null, JSON.stringify({ state: 1, nozzleTemp: 21000, printFileName: 'cube.gcode', printProgress: 12 }));
  assert.equal(first?.stateCode, 1);
  assert.equal(first?.nozzle.current, 210);
  assert.equal(first?.taskName, 'cube.gcode');
  const merged = applyCrealityMessage(first, JSON.stringify({ bedTemp: 60 }));
  assert.equal(merged?.nozzle.current, 210);
  assert.equal(merged?.bed.current, 60);
  assert.equal(merged?.stateCode, 1);
  assert.equal(applyCrealityMessage(merged, '{"heartbeat":1,"modeCode":0}'), null);
});

test('WebSocket 打开后发送首包，收到快照才算连接成功', async () => {
  const { openCrealitySession } = await import('@/src/runtime/creality-session');
  const { toPrinterCard } = await import('@/src/runtime/project');
  const socket = {
    sent: [] as string[],
    send(data: string) {
      this.sent.push(data);
    },
    close() {
      this.onclose?.();
    },
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null as (() => void) | null,
    onclose: null as (() => void) | null,
  };
  const snapshots: { stateCode: number | null }[] = [];
  const failures: string[] = [];
  const session = openCrealitySession({
    url: 'ws://172.18.170.163:9999',
    openSocket: () => socket,
    onSnapshot: (readings) => snapshots.push(readings),
    onFailed: (reason) => failures.push(reason),
  });
  socket.onopen?.();
  const bootstrap = JSON.parse(socket.sent[0]) as { method: string; params: { printerInfo: number } };
  assert.equal(bootstrap.method, 'get');
  assert.equal(bootstrap.params.printerInfo, 1);
  assert.equal(snapshots.length, 0);
  socket.onmessage?.({ data: JSON.stringify({ state: 0, nozzleTemp: 36 }) });
  assert.equal(snapshots[0]?.stateCode, 0);
  assert.deepEqual(failures, []);

  const card = toPrinterCard(device({ ipAddress: '172.18.170.163', model: 'F039' }), {
    phase: 'online',
    reason: '',
    readings: {
      stateCode: 0,
      nozzle: { current: 36, target: 0 },
      bed: { current: 25, target: 0 },
      progress: null,
      taskName: '',
      remainingSec: null,
      currentLayer: null,
      totalLayers: null,
    },
  });
  assert.equal(card.model, 'F039');
  assert.equal(card.modelCode, 'F039');
  assert.equal(card.status, 'standby');
  assert.equal(card.connectionNote, '');
  const failed = toPrinterCard(device(), { phase: 'offline', reason: '连接 192.168.1.10:9999 超时', readings: null });
  assert.equal(failed.status, 'offline');
  assert.equal(failed.connectionNote, '连接 192.168.1.10:9999 超时');
  const connecting = toPrinterCard(device(), { phase: 'connecting', reason: '', readings: null });
  assert.equal(connecting.status, 'connecting');
  session.close();
});

test('创想内部代号对应机型缩略图文件', () => {
  assert.equal(crealityThumbnailFile('F022'), 'sparkx-i7.png');
  assert.equal(crealityThumbnailFile('f018'), 'hi.png');
  assert.equal(crealityThumbnailFile('K1C'), 'k1c.png');
  assert.equal(crealityThumbnailFile('Ender-5 Max'), 'ender-5-max.png');
  assert.equal(crealityThumbnailFile('K1'), 'k1.png');
  assert.equal(crealityThumbnailFile('F039'), null);
  assert.equal(crealityThumbnailFile(''), null);
});

test('创想内部代号换成对外展示名，未收录的代号保持原样', () => {
  assert.equal(resolveCrealityDisplayModel('F004'), 'Ender-5 Max');
  assert.equal(resolveCrealityDisplayModel('F022'), 'SPARKX i7');
  assert.equal(resolveCrealityDisplayModel('F018'), 'Creality Hi');
  assert.equal(resolveCrealityDisplayModel('CR-K1'), 'K1');
  assert.equal(resolveCrealityDisplayModel('SPARKX i7'), 'SPARKX i7');
  assert.equal(resolveCrealityDisplayModel('F039'), 'F039');
  assert.equal(resolveCrealityDisplayModel(''), '');
  const named = toPrinterCard(device({ model: 'F004' }), { phase: 'offline', reason: '', readings: null });
  assert.equal(named.model, 'Ender-5 Max');
  assert.equal(named.modelCode, 'F004');
});

test('添加设备先选品牌，创想和拓竹可以继续', () => {
  assert.deepEqual(
    DEVICE_BRANDS.map((brand) => brand.name),
    ['创想三维 Creality', '拓竹 Bambu Lab', 'Snapmaker', '闪铸 Flashforge', '纵维立方 Anycubic'],
  );
  assert.deepEqual(
    DEVICE_BRANDS.filter((brand) => brand.ready).map((brand) => brand.driver),
    ['creality', 'bambu'],
  );
});

test('拓竹屏幕全文取出 IP 和访问码', () => {
  const identity = parseBambuScreen('IP地址\n192.168.1.20\n访问码\nabcd1234');
  assert.equal(identity.ip, '192.168.1.20');
  assert.equal(identity.code, 'abcd1234');
  assert.equal(parseBambuScreen('访问码：39A27C1B').code, '39A27C1B');
});

test('创想屏幕全文只取局域网 IP', () => {
  assert.equal(parseCrealityScreen('IP地址：172.18.170.163:80\n序列号 4322572815C138').ip, '172.18.170.163');
  assert.equal(parseCrealityScreen('公网 8.8.8.8\n局域网\n10.0.0.8').ip, '10.0.0.8');
  assert.equal(parseCrealityScreen('8.8.8.8').ip, '');
  assert.equal(parseCrealityScreen('IP: 8.8.8.8\n192.168.1.9').ip, '192.168.1.9');
});

test('拓竹卡片显示 MQTT 端口，并保留识别到的名称', () => {
  const plan = planDeviceUpsert([], {
    ipAddress: '192.168.1.20',
    httpPort: 0,
    driver: 'bambu',
    accessCode: 'code',
    mqttPort: 8883,
    name: '工作室',
    info: {
      mac: '',
      model: 'P1S',
      serialNumber: '01P00A000000001',
      firmware: '',
      hostname: '工作室',
    },
    now: NOW,
  });
  assert.equal(plan.saved.name, '工作室');
  const card = toPrinterCard(plan.saved, { phase: 'offline', reason: '当前应用还不能保持拓竹 MQTT 会话。', readings: null });
  assert.equal(card.driver, 'bambu');
  assert.equal(card.port, 8883);
  assert.equal(card.model, 'P1S');
  assert.equal(card.connectionNote, '当前应用还不能保持拓竹 MQTT 会话。');
  const creality = toPrinterCard(device({ httpPort: 80 }), { phase: 'offline', reason: '', readings: null });
  assert.equal(creality.driver, 'creality');
  assert.equal(creality.port, 80);
});

test('拓竹手动添加：坏 IP 直接失败且不识别', async () => {
  let identifyCalls = 0;
  const apis: BambuAddApis = {
    identifyHost: async () => {
      identifyCalls += 1;
      return bambuIdentity();
    },
    testLanConnection: async () => ({ ok: true }),
  };
  const outcome = await runBambuManualConnectionTest(
    { ipAddress: 'not-an-ip', serialNumber: '', accessCode: 'code', mqttPort: '8883' },
    apis,
  );
  assert.equal(outcome.status, 'invalid-ip');
  assert.equal(identifyCalls, 0);
});

test('拓竹手动添加：公网地址和非法端口在识别前拦住', async () => {
  let identifyCalls = 0;
  const apis: BambuAddApis = {
    identifyHost: async () => {
      identifyCalls += 1;
      return bambuIdentity();
    },
    testLanConnection: async () => ({ ok: true }),
  };
  const publicIp = await runBambuManualConnectionTest(
    { ipAddress: '8.8.8.8', serialNumber: '', accessCode: 'code', mqttPort: '8883' },
    apis,
  );
  assert.equal(publicIp.status, 'invalid-lan');
  const badPort = await runBambuManualConnectionTest(
    { ipAddress: '192.168.1.20', serialNumber: '01P00A000000001', accessCode: 'code', mqttPort: '70000' },
    apis,
  );
  assert.equal(badPort.status, 'invalid-port');
  const defaultPort = await runBambuManualConnectionTest(
    { ipAddress: '192.168.1.20', serialNumber: '01P00A000000001', accessCode: 'code', mqttPort: '' },
    apis,
  );
  assert.equal(defaultPort.status, 'mqtt-success');
  if (defaultPort.status === 'mqtt-success') assert.equal(defaultPort.identity.mqttPort, 8883);
  assert.equal(identifyCalls, 0);
});

test('拓竹手动添加：识别不到序列号', async () => {
  const outcome = await runBambuManualConnectionTest(
    { ipAddress: '192.168.1.20', serialNumber: '', accessCode: 'code', mqttPort: '8883' },
    {
      identifyHost: async () => bambuIdentity({ serialNumber: '' }),
      testLanConnection: async () => ({ ok: true }),
    },
  );
  assert.equal(outcome.status, 'identify-failed');
  if (outcome.status !== 'identify-failed') return;
  assert.equal(outcome.message, BAMBU_IDENTIFY_FAILED_MESSAGE);
});

test('拓竹手动添加：识别到序列号但缺访问码', async () => {
  const outcome = await runBambuManualConnectionTest(
    { ipAddress: '192.168.1.20', serialNumber: '', accessCode: '', mqttPort: '8883' },
    {
      identifyHost: async () => bambuIdentity({ serialNumber: '01P00A000000001' }),
      testLanConnection: async () => ({ ok: true }),
    },
  );
  assert.equal(outcome.status, 'need-access-code');
  if (outcome.status !== 'need-access-code') return;
  assert.match(outcome.message, /01P00A000000001/);
});

test('拓竹手动添加：已有序列号时 MQTT 失败不识别', async () => {
  let identifyCalls = 0;
  const outcome = await runBambuManualConnectionTest(
    { ipAddress: '192.168.1.20', serialNumber: '01P00A000000001', accessCode: 'code', mqttPort: '8883' },
    {
      identifyHost: async () => {
        identifyCalls += 1;
        return bambuIdentity();
      },
      testLanConnection: async () => ({ ok: false, message: '握手失败' }),
    },
  );
  assert.equal(outcome.status, 'mqtt-failed');
  assert.equal(identifyCalls, 0);
});

test('拓竹手动添加：MQTT 成功时型号来自握手', async () => {
  const outcome = await runBambuManualConnectionTest(
    { ipAddress: '192.168.1.20', serialNumber: '01P00A000000001', accessCode: 'code', mqttPort: '8883' },
    {
      identifyHost: async () => bambuIdentity(),
      testLanConnection: async () => ({ ok: true, model: 'P1S', serialNumber: '01P00A000000001', firmware: '01.08.00.00' }),
    },
  );
  assert.equal(outcome.status, 'mqtt-success');
  if (outcome.status !== 'mqtt-success') return;
  assert.equal(outcome.identity.model, 'P1S');
});

test('拓竹手动添加：识别 AbortError 视为 aborted', async () => {
  const outcome = await runBambuManualConnectionTest(
    { ipAddress: '192.168.1.20', serialNumber: '', accessCode: 'code', mqttPort: '8883' },
    {
      identifyHost: async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      },
      testLanConnection: async () => ({ ok: true }),
    },
  );
  assert.equal(outcome.status, 'aborted');
});

test('同 IP 的创想和拓竹档案互不合并', () => {
  const creality = device({ id: 'creality-1', ipAddress: '192.168.1.20', serialNumber: 'SN1' });
  const plan = planDeviceUpsert([creality], {
    ipAddress: '192.168.1.20',
    httpPort: 0,
    driver: 'bambu',
    accessCode: 'access-code',
    mqttPort: 8883,
    info: {
      mac: '',
      model: 'X1C',
      serialNumber: '01P00A000000001',
      firmware: '01.07.00.00',
      hostname: '',
    },
    now: NOW,
  });
  assert.notEqual(plan.saved.id, creality.id);
  assert.equal(plan.saved.driver, 'bambu');
  assert.equal(plan.saved.accessCode, 'access-code');
  assert.equal(plan.saved.wsPort, 0);
  assert.equal(plan.saved.mqttPort, 8883);
  assert.deepEqual(plan.removeIds, []);
});

test('拓竹局域网宣告里的 USN 就是序列号', () => {
  const { parseBambuSsdpMessage } = require('../../scripts/bambu-cert-probe.cjs') as {
    parseBambuSsdpMessage: (message: Buffer, remoteAddress?: string) => { ipAddress: string; serialNumber: string } | null;
  };
  const message = Buffer.from(
    ['HTTP/1.1 200 OK', 'NT: urn:bambulab-com:device:3dprinter:1', 'USN: uuid:01P00C471600940', 'Location: 172.18.168.20', '', ''].join('\r\n'),
  );
  const parsed = parseBambuSsdpMessage(message, '172.18.168.20');
  assert.equal(parsed?.serialNumber, '01P00C471600940');
  assert.equal(parsed?.ipAddress, '172.18.168.20');
  assert.equal(parseBambuSsdpMessage(Buffer.from('HTTP/1.1 200 OK\r\nUSN: abc\r\n\r\n'), '10.0.0.1'), null);
});

test('8883 证书主题里的序列号可以读出来', async () => {
  const { probeBambuCertificate, serialFromPeerCertificate } = require('../../scripts/bambu-cert-probe.cjs') as {
    probeBambuCertificate: (input: { host: string; port: number; timeoutMs?: number }) => Promise<string>;
    serialFromPeerCertificate: (certificate: { subject?: { CN?: string; serialNumber?: string }; subjectaltname?: string }) => string;
  };
  assert.equal(serialFromPeerCertificate({ subject: { CN: '01P00A123456789' } }), '01P00A123456789');
  assert.equal(serialFromPeerCertificate({ subject: { CN: 'CN=03900C123456789, O=Bambu' } }), '03900C123456789');

  const dir = mkdtempSync(join(tmpdir(), 'bambu-cert-'));
  try {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-nodes', '-subj', '/CN=01P00C471600940'],
      { stdio: 'ignore' },
    );
    const server = createTlsServer({
      key: readFileSync(join(dir, 'key.pem')),
      cert: readFileSync(join(dir, 'cert.pem')),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const serial = await probeBambuCertificate({ host: '127.0.0.1', port, timeoutMs: 4000 });
      assert.equal(serial, '01P00C471600940');
    } finally {
      server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('拓竹 MQTT 握手要收到状态回报才算成功', async () => {
  const { probeBambuMqtt, publishPacket, takeMqttPacket, MQTT_AUTH_FAILED_MESSAGE } = require('../../scripts/bambu-cert-probe.cjs') as {
    probeBambuMqtt: (input: {
      host: string;
      port: number;
      serialNumber: string;
      accessCode: string;
      timeoutMs?: number;
    }) => Promise<{ ok: boolean; message?: string; model?: string; firmware?: string }>;
    publishPacket: (topic: string, body: string) => Buffer;
    takeMqttPacket: (buffer: Buffer) => { type: number; body: Buffer; rest: Buffer } | null;
    MQTT_AUTH_FAILED_MESSAGE: string;
  };
  const serial = '01P00C471600940';
  const dir = mkdtempSync(join(tmpdir(), 'bambu-mqtt-'));
  const listen = async (onConnection: (socket: import('node:tls').TLSSocket) => void) => {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-nodes', '-subj', `/CN=${serial}`],
      { stdio: 'ignore' },
    );
    const server = createTlsServer(
      { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
      onConnection,
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { server, port };
  };
  try {
    const denied = await listen((socket) => {
      socket.on('data', () => socket.write(Buffer.from([0x20, 0x02, 0x00, 0x04])));
    });
    try {
      const rejected = await probeBambuMqtt({
        host: '127.0.0.1',
        port: denied.port,
        serialNumber: serial,
        accessCode: 'bad',
        timeoutMs: 3000,
      });
      assert.equal(rejected.ok, false);
      assert.equal(rejected.message, MQTT_AUTH_FAILED_MESSAGE);
    } finally {
      denied.server.close();
    }

    const accepted = await listen((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
          const packet = takeMqttPacket(buffer);
          if (!packet) break;
          buffer = packet.rest;
          if (packet.type === 1) socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00]));
          if (packet.type === 8) {
            socket.write(Buffer.concat([Buffer.from([0x90, 0x03]), packet.body.subarray(0, 2), Buffer.from([0x00])]));
          }
          if (packet.type === 3) {
            socket.write(
              publishPacket(
                `device/${serial}/report`,
                JSON.stringify({ info: { module: [{ product_name: 'P1S', sw_ver: '01.08.00.00' }] } }),
              ),
            );
          }
        }
      });
    });
    try {
      const result = await probeBambuMqtt({
        host: '127.0.0.1',
        port: accepted.port,
        serialNumber: serial,
        accessCode: 'code',
        timeoutMs: 3000,
      });
      assert.equal(result.ok, true);
      assert.equal(result.model, 'P1S');
      assert.equal(result.firmware, '01.08.00.00');
    } finally {
      accepted.server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('拓竹会话保持连接，并把 gcode_state 映射成设备状态', async () => {
  const { projectBambuReadings, openBambuSession, readBambuSession, closeBambuSession, publishPacket, takeMqttPacket } =
    require('../../scripts/bambu-cert-probe.cjs') as {
      projectBambuReadings: (print: Record<string, unknown>) => {
        stateCode: number | null;
        nozzle: { current: number };
        remainingSec: number | null;
        taskName: string;
      };
      openBambuSession: (input: {
        deviceId: string;
        host: string;
        port: number;
        serialNumber: string;
        accessCode: string;
      }) => { phase: string };
      readBambuSession: (deviceId: string) => {
        phase: string;
        readings: { stateCode: number | null; nozzle: { current: number }; taskName: string; remainingSec: number | null } | null;
      };
      closeBambuSession: (deviceId: string) => void;
      publishPacket: (topic: string, body: string) => Buffer;
      takeMqttPacket: (buffer: Buffer) => { type: number; body: Buffer; rest: Buffer } | null;
    };
  assert.equal(projectBambuReadings({ gcode_state: 'IDLE' }).stateCode, 0);
  assert.equal(projectBambuReadings({ gcode_state: 'RUNNING' }).stateCode, 1);
  assert.equal(projectBambuReadings({ gcode_state: 'PREPARE' }).stateCode, 1);
  assert.equal(projectBambuReadings({ gcode_state: 'PAUSE' }).stateCode, 5);
  assert.equal(projectBambuReadings({ gcode_state: 'FINISH' }).stateCode, 2);
  assert.equal(projectBambuReadings({ gcode_state: 'FAILED' }).stateCode, 3);
  assert.equal(projectBambuReadings({ mc_remaining_time: 2 }).remainingSec, 120);
  assert.equal(
    toPrinterCard(device({ driver: 'bambu', model: 'P1S' }), {
      phase: 'online',
      reason: '',
      readings: projectBambuReadings({ gcode_state: 'IDLE' }) as Readings,
    }).status,
    'standby',
  );

  const serial = '01P00C471600940';
  const deviceId = 'bambu-live-session';
  const dir = mkdtempSync(join(tmpdir(), 'bambu-live-'));
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-nodes', '-subj', `/CN=${serial}`],
    { stdio: 'ignore' },
  );
  let printer: import('node:tls').TLSSocket | null = null;
  const server = createTlsServer(
    { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
    (socket) => {
      printer = socket;
      let buffer = Buffer.alloc(0);
      let reported = false;
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
          const packet = takeMqttPacket(buffer);
          if (!packet) break;
          buffer = packet.rest;
          if (packet.type === 1) socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00]));
          if (packet.type === 8) {
            socket.write(Buffer.concat([Buffer.from([0x90, 0x03]), packet.body.subarray(0, 2), Buffer.from([0x00])]));
          }
          if (packet.type === 3 && !reported) {
            reported = true;
            socket.write(
              publishPacket(
                `device/${serial}/report`,
                JSON.stringify({
                  print: {
                    gcode_state: 'RUNNING',
                    nozzle_temper: 210,
                    nozzle_target_temper: 220,
                    bed_temper: 60,
                    bed_target_temper: 60,
                    mc_percent: 40,
                    subtask_name: 'cat.3mf',
                    mc_remaining_time: 10,
                    layer_num: 4,
                    total_layer_num: 80,
                  },
                }),
              ),
            );
          }
        }
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const waitFor = async (read: () => boolean) => {
    const start = Date.now();
    while (Date.now() - start < 4000) {
      if (read()) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('拓竹会话没有在时限内更新状态');
  };
  try {
    openBambuSession({ deviceId, host: '127.0.0.1', port, serialNumber: serial, accessCode: 'code' });
    await waitFor(() => readBambuSession(deviceId).phase === 'online' && readBambuSession(deviceId).readings?.stateCode === 1);
    const live = readBambuSession(deviceId);
    assert.equal(live.readings?.stateCode, 1);
    assert.equal(live.readings?.nozzle.current, 210);
    assert.equal(live.readings?.taskName, 'cat.3mf');
    assert.equal(live.readings?.remainingSec, 600);
    printer?.write(publishPacket(`device/${serial}/report`, JSON.stringify({ print: { gcode_state: 'PAUSE' } })));
    await waitFor(() => readBambuSession(deviceId).readings?.stateCode === 5);
    assert.equal(readBambuSession(deviceId).readings?.nozzle.current, 210);
  } finally {
    closeBambuSession(deviceId);
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('拓竹添加按钮：缺访问码不可点，有效 IP 加访问码可点', () => {
  assert.equal(canSubmitBambuManualAdd({ ipAddress: '192.168.1.20', accessCode: '' }), false);
  assert.equal(canSubmitBambuManualAdd({ ipAddress: '192.168.1.20', accessCode: 'code' }), true);
});

test('置顶排到当前列表前面，取消后回到原顺序', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const pinned = pinDeviceId(pinDeviceId([], 'b'), 'c');
  assert.deepEqual(pinned, ['c', 'b']);
  assert.deepEqual(
    applyPinnedDeviceOrder(items, pinned).map((item) => item.id),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(
    applyPinnedDeviceOrder(items, unpinDeviceId(pinned, 'c')).map((item) => item.id),
    ['b', 'a', 'c'],
  );
  assert.deepEqual(
    applyPinnedDeviceOrder(
      items.filter((item) => item.id !== 'c'),
      pinned,
    ).map((item) => item.id),
    ['b', 'a'],
  );
});
