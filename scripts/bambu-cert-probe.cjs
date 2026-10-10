/**
 * 与 creafab-one 相同：先连 8883 做 TLS 握手，从证书主题读序列号；
 * 证书里没有时，再用局域网 SSDP 宣告里的 USN。不建立 MQTT。
 * Expo Go 没有原始 TLS，开发时由 Metro 在本机代读。
 */
const dgram = require('node:dgram');
const net = require('node:net');
const os = require('node:os');
const tls = require('node:tls');

function readCertField(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return '';
}

function extractBambuSerialToken(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const match = value.toUpperCase().match(/[0-9]{2}[0-9A-Z]{10,}/);
  if (match?.[0]) return match[0];
  const token = value.split(/[\s/,=]/).find((part) => part.trim().length >= 3)?.trim();
  return token || value;
}

function strictBambuSerial(raw) {
  const value = String(raw ?? '').trim().toUpperCase();
  return value.match(/[0-9]{2}[0-9A-Z]{10,}/)?.[0] || '';
}

function serialFromPeerCertificate(certificate) {
  const chunks = [];
  const visit = (value) => {
    if (typeof value === 'string') chunks.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(certificate?.subject);
  if (typeof certificate?.subjectaltname === 'string') chunks.push(certificate.subjectaltname);
  for (const chunk of chunks) {
    const serial = strictBambuSerial(chunk);
    if (serial) return serial;
  }
  return '';
}

function normalizeBambuSsdpSerial(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const stripped = value.replace(/^urn:uuid:/i, '').replace(/^uuid:/i, '').trim();
  if (!stripped) return '';
  const serial = stripped.includes(':') ? stripped.split(':').filter(Boolean).pop()?.trim() : stripped;
  return serial || '';
}

function parseBambuSsdpMessage(message, remoteAddress) {
  const lines = Buffer.from(message).toString('utf8').split(/\r?\n/).map((line) => line.trim());
  if (!lines[0]?.toUpperCase().includes('HTTP/1.1')) return null;
  const headers = new Map();
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
  }
  const nt = headers.get('nt') ?? headers.get('st') ?? '';
  const server = headers.get('server') ?? '';
  const looksBambu =
    nt.toLowerCase().includes('bambulab') ||
    server.toLowerCase().includes('bambulab') ||
    Boolean(headers.get('devmodel.bambu.com')) ||
    Boolean(headers.get('devname.bambu.com'));
  if (!looksBambu) return null;
  const location = headers.get('location') ?? '';
  const ipAddress = location.match(/(\d{1,3}(?:\.\d{1,3}){3})/)?.[1] || String(remoteAddress ?? '').trim();
  if (!ipAddress) return null;
  return {
    ipAddress,
    serialNumber: normalizeBambuSsdpSerial(headers.get('usn')),
  };
}

function discoverBambuSsdpSerial(targetIp, timeoutMs = 2500) {
  const packet = Buffer.from(
    ['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'ST: urn:bambulab-com:device:3dprinter:1', 'MX: 2', '', ''].join('\r\n'),
    'utf8',
  );
  const addresses = Object.values(os.networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => (entry.family === 'IPv4' || entry.family === 4) && !entry.internal)
    .map((entry) => entry.address);
  const bindAddresses = addresses.length > 0 ? addresses : ['0.0.0.0'];
  return new Promise((resolve) => {
    let settled = false;
    const sockets = [];
    const finish = (serialNumber) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const socket of sockets) {
        try {
          socket.close();
        } catch {
          // 网卡已经关掉时忽略。
        }
      }
      resolve(serialNumber || '');
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    for (const address of bindAddresses) {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sockets.push(socket);
      socket.on('message', (message, remote) => {
        const parsed = parseBambuSsdpMessage(message, remote.address);
        if (parsed?.ipAddress === targetIp && parsed.serialNumber) finish(parsed.serialNumber);
      });
      socket.on('error', () => undefined);
      socket.bind({ address, exclusive: false }, () => {
        try {
          socket.setBroadcast(true);
          socket.setMulticastTTL(2);
        } catch {
          // 某些网卡不支持组播选项。
        }
        for (const port of [2021, 1990]) {
          try {
            socket.send(packet, port, '239.255.255.250');
          } catch {
            // 这一块网卡发不出去时继续试下一块。
          }
        }
      });
    }
  });
}

function isPrivateIpv4(value) {
  const parts = String(value ?? '')
    .trim()
    .split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => part > 255)) return false;
  const [a, b] = numbers;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function probeBambuCertificate(input) {
  const host = String(input.host ?? '').trim();
  const port = Number(input.port) || 8883;
  const tcpTimeoutMs = input.tcpTimeoutMs ?? 4000;
  const tlsTimeoutMs = input.tlsTimeoutMs ?? (input.timeoutMs ?? 6000);
  return new Promise((resolve) => {
    let settled = false;
    let tcp = null;
    let tlsSocket = null;
    let tcpTimer = null;
    let tlsTimer = null;
    const finish = (serialNumber) => {
      if (settled) return;
      settled = true;
      if (tcpTimer) clearTimeout(tcpTimer);
      if (tlsTimer) clearTimeout(tlsTimer);
      if (tlsSocket) tlsSocket.destroy();
      else tcp?.destroy();
      resolve(serialNumber || '');
    };
    tcp = net.connect({ host, port });
    tcpTimer = setTimeout(() => finish(''), tcpTimeoutMs);
    tcp.once('error', () => finish(''));
    tcp.once('connect', () => {
      if (tcpTimer) clearTimeout(tcpTimer);
      tlsSocket = tls.connect({
        socket: tcp,
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      });
      tlsTimer = setTimeout(() => finish(''), tlsTimeoutMs);
      tlsSocket.once('secureConnect', () => {
        const serial = serialFromPeerCertificate(tlsSocket.getPeerCertificate(true));
        finish(serial);
      });
      tlsSocket.once('error', () => finish(''));
    });
  });
}

function identifyBambuSerial(input) {
  const host = String(input.host ?? '').trim();
  return Promise.all([
    probeBambuCertificate(input),
    discoverBambuSsdpSerial(host, input.ssdpTimeoutMs ?? 2500),
  ]).then(([certificateSerial, ssdpSerial]) => certificateSerial || ssdpSerial || '');
}

const MQTT_FAILED_MESSAGE = '连接测试失败，请检查 IP / 序列号 / 访问码。';
const MQTT_AUTH_FAILED_MESSAGE = '连接测试失败，请检查访问码。';
const MQTT_NO_REPORT_MESSAGE = '已建立 MQTT 连接，但未收到设备首条状态回报，请检查序列号和 LAN 模式。';

function mqttString(value) {
  const body = Buffer.from(String(value), 'utf8');
  const head = Buffer.alloc(2);
  head.writeUInt16BE(body.length, 0);
  return Buffer.concat([head, body]);
}

function encodeRemainingLength(length) {
  const bytes = [];
  let rest = length;
  do {
    let encoded = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) encoded |= 0x80;
    bytes.push(encoded);
  } while (rest > 0);
  return Buffer.from(bytes);
}

function encodeMqttPacket(typeByte, payload) {
  return Buffer.concat([Buffer.from([typeByte]), encodeRemainingLength(payload.length), payload]);
}

function readRemainingLength(buffer, offset) {
  let multiplier = 1;
  let value = 0;
  let bytes = 0;
  let byte = 0;
  do {
    if (offset + bytes >= buffer.length) return null;
    byte = buffer[offset + bytes];
    value += (byte & 0x7f) * multiplier;
    multiplier *= 128;
    bytes += 1;
    if (bytes > 4) return null;
  } while (byte & 0x80);
  return { value, bytes };
}

function takeMqttPacket(buffer) {
  if (buffer.length < 2) return null;
  const length = readRemainingLength(buffer, 1);
  if (!length) return null;
  const start = 1 + length.bytes;
  const end = start + length.value;
  if (buffer.length < end) return null;
  return {
    type: buffer[0] >> 4,
    flags: buffer[0],
    body: buffer.subarray(start, end),
    rest: buffer.subarray(end),
  };
}

function readMqttString(buffer, offset) {
  if (offset + 2 > buffer.length) return null;
  const length = buffer.readUInt16BE(offset);
  const start = offset + 2;
  const end = start + length;
  if (end > buffer.length) return null;
  return { value: buffer.subarray(start, end).toString('utf8'), next: end };
}

function connectPacket(clientId, username, password) {
  const payload = Buffer.concat([
    mqttString('MQTT'),
    Buffer.from([0x04, 0xc2, 0x00, 0x1e]),
    mqttString(clientId),
    mqttString(username),
    mqttString(password),
  ]);
  return encodeMqttPacket(0x10, payload);
}

function subscribePacket(packetId, topic) {
  const payload = Buffer.concat([
    Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]),
    mqttString(topic),
    Buffer.from([0x00]),
  ]);
  return encodeMqttPacket(0x82, payload);
}

function publishPacket(topic, body) {
  return encodeMqttPacket(0x30, Buffer.concat([mqttString(topic), Buffer.from(body, 'utf8')]));
}

function readText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function extractDeviceInfo(raw) {
  const root = raw && typeof raw === 'object' ? raw : {};
  const print = root.print && typeof root.print === 'object' ? root.print : {};
  const info = root.info && typeof root.info === 'object' ? root.info : {};
  const modules = Array.isArray(info.module) ? info.module : [];
  let moduleName = '';
  let firmware = '';
  for (const item of modules) {
    if (!item || typeof item !== 'object') continue;
    moduleName = moduleName || readText(item.product_name) || readText(item.dev_model_name);
    firmware = firmware || readText(item.sw_ver) || readText(item.version);
  }
  return {
    model:
      readText(print.dev_model_name) ||
      readText(print.dev_product_name) ||
      readText(print.model_name) ||
      readText(info.dev_model_name) ||
      moduleName ||
      readText(info.model_name),
    firmware,
  };
}

function probeBambuMqtt(input) {
  const host = String(input.host ?? '').trim();
  const port = Number(input.port) || 8883;
  const serialNumber = String(input.serialNumber ?? '').trim();
  const accessCode = String(input.accessCode ?? '');
  const timeoutMs = input.timeoutMs ?? 15000;
  const reportTopic = `device/${serialNumber}/report`;
  const requestTopic = `device/${serialNumber}/request`;
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let socket = null;
    let model = '';
    let firmware = '';
    let stage = 'connect';
    let buffer = Buffer.alloc(0);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket?.destroy();
      resolve(result);
    };
    const failed = (message) => finish({ ok: false, message, serialNumber, model, firmware });
    socket = tls.connect({
      host,
      port,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    });
    timer = setTimeout(() => failed(stage === 'report' ? MQTT_NO_REPORT_MESSAGE : MQTT_FAILED_MESSAGE), timeoutMs);
    socket.once('secureConnect', () => {
      socket.write(connectPacket(`creafab${Date.now().toString(36).slice(-8)}`, 'bblp', accessCode));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (!settled) {
        const packet = takeMqttPacket(buffer);
        if (!packet) break;
        buffer = packet.rest;
        if (packet.type === 2) {
          const code = packet.body[1] ?? 0xff;
          if (code !== 0) {
            failed(code === 4 || code === 5 ? MQTT_AUTH_FAILED_MESSAGE : MQTT_FAILED_MESSAGE);
            return;
          }
          stage = 'subscribe';
          socket.write(subscribePacket(1, reportTopic));
          continue;
        }
        if (packet.type === 9) {
          stage = 'report';
          socket.write(publishPacket(requestTopic, JSON.stringify({ pushing: { command: 'pushall' } })));
          socket.write(
            publishPacket(requestTopic, JSON.stringify({ info: { sequence_id: '0', command: 'get_version' } })),
          );
          continue;
        }
        if (packet.type !== 3) continue;
        const topic = readMqttString(packet.body, 0);
        if (!topic) continue;
        let offset = topic.next;
        const qos = (packet.flags >> 1) & 0x03;
        if (qos > 0) offset += 2;
        const text = packet.body.subarray(offset).toString('utf8');
        try {
          const info = extractDeviceInfo(JSON.parse(text));
          if (info.model) model = info.model;
          if (info.firmware) firmware = info.firmware;
        } catch {
          // 非 JSON 回报仍算设备在线。
        }
        if (stage !== 'report') continue;
        const waitMs = model ? 0 : 1500;
        setTimeout(() => finish({ ok: true, serialNumber, model, firmware }), waitMs);
        stage = 'done';
      }
    });
    socket.once('error', () => failed(MQTT_FAILED_MESSAGE));
  });
}

function gcodeCategory(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('pause')) return 'paused';
  if (normalized.includes('finish')) return 'finished';
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('exception')) return 'failed';
  if (normalized.includes('run') || normalized.includes('prepare') || normalized.includes('slic')) return 'running';
  if (normalized.includes('idle') || normalized.includes('ready') || normalized.includes('stop')) return 'idle';
  return 'unknown';
}

function projectBambuReadings(print) {
  const category = gcodeCategory(print?.gcode_state);
  const stateCode =
    category === 'paused' ? 5 : category === 'finished' ? 2 : category === 'failed' ? 3 : category === 'running' ? 1 : category === 'idle' ? 0 : null;
  const remainingMin = readNum(print?.mc_remaining_time);
  return {
    stateCode,
    nozzle: { current: readNum(print?.nozzle_temper) ?? 0, target: readNum(print?.nozzle_target_temper) ?? 0 },
    bed: { current: readNum(print?.bed_temper) ?? 0, target: readNum(print?.bed_target_temper) ?? 0 },
    progress: readNum(print?.mc_percent),
    taskName: readText(print?.subtask_name) || readText(print?.gcode_file),
    remainingSec: remainingMin === null ? null : remainingMin * 60,
    currentLayer: readNum(print?.layer_num),
    totalLayers: readNum(print?.total_layer_num),
  };
}

function readNum(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

const bambuSessions = new Map();

function sessionView(session) {
  return {
    phase: session.phase,
    reason: session.reason,
    readings: session.phase === 'online' ? session.readings : null,
    present: true,
  };
}

function applyBambuReport(session, json) {
  if (json && json.print && typeof json.print === 'object') {
    const incoming = { ...json.print };
    if (typeof incoming.gcode_state === 'string' && !incoming.gcode_state.trim()) delete incoming.gcode_state;
    session.print = { ...session.print, ...incoming };
  }
  session.readings = projectBambuReadings(session.print);
  session.phase = 'online';
  session.reason = '';
  session.authFailed = false;
}

function scheduleBambuReconnect(session) {
  if (session.closed || session.timer) return;
  session.timer = setTimeout(() => {
    session.timer = null;
    connectBambuSession(session);
  }, session.authFailed ? 15000 : 3000);
}

function connectBambuSession(session) {
  if (session.closed || session.socket) return;
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  session.phase = 'connecting';
  session.reason = '';
  let buffer = Buffer.alloc(0);
  let stage = 'connect';
  const reportTopic = `device/${session.serialNumber}/report`;
  const requestTopic = `device/${session.serialNumber}/request`;
  const socket = tls.connect({
    host: session.host,
    port: session.port,
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
  });
  session.socket = socket;
  const ping = setInterval(() => {
    if (session.closed || session.socket !== socket) {
      clearInterval(ping);
      return;
    }
    socket.write(Buffer.from([0xc0, 0x00]));
  }, 20000);
  socket.on('close', () => clearInterval(ping));
  const drop = (reason, authFailed) => {
    session.authFailed = authFailed;
    session.phase = 'offline';
    session.reason = reason;
    socket.destroy();
  };
  socket.once('secureConnect', () => {
    socket.write(connectPacket(`creafab${Date.now().toString(36).slice(-8)}`, 'bblp', session.accessCode));
  });
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const packet = takeMqttPacket(buffer);
      if (!packet) break;
      buffer = packet.rest;
      if (packet.type === 2) {
        const code = packet.body[1] ?? 0xff;
        if (code !== 0) {
          drop(code === 4 || code === 5 ? MQTT_AUTH_FAILED_MESSAGE : MQTT_FAILED_MESSAGE, code === 4 || code === 5);
          return;
        }
        stage = 'subscribe';
        socket.write(subscribePacket(1, reportTopic));
        continue;
      }
      if (packet.type === 12) {
        socket.write(Buffer.from([0xd0, 0x00]));
        continue;
      }
      if (packet.type === 9) {
        stage = 'report';
        session.phase = 'online';
        session.reason = '';
        session.authFailed = false;
        socket.write(publishPacket(requestTopic, JSON.stringify({ pushing: { command: 'pushall' } })));
        socket.write(publishPacket(requestTopic, JSON.stringify({ info: { sequence_id: '0', command: 'get_version' } })));
        continue;
      }
      if (packet.type !== 3 || stage === 'connect') continue;
      const topic = readMqttString(packet.body, 0);
      if (!topic) continue;
      let offset = topic.next;
      const qos = (packet.flags >> 1) & 0x03;
      if (qos > 0) {
        if (packet.body.length >= offset + 2) {
          const packetId = packet.body.readUInt16BE(offset);
          socket.write(Buffer.from([0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff]));
        }
        offset += 2;
      }
      try {
        applyBambuReport(session, JSON.parse(packet.body.subarray(offset).toString('utf8')));
      } catch {
        session.phase = 'online';
        session.reason = '';
      }
    }
  });
  socket.on('error', () => undefined);
  socket.on('close', () => {
    if (session.socket === socket) session.socket = null;
    if (session.closed) return;
    if (session.phase !== 'offline') {
      session.phase = 'offline';
      session.reason = '连接已断开';
    }
    scheduleBambuReconnect(session);
  });
}

function openBambuSession(input) {
  const deviceId = String(input.deviceId ?? '').trim();
  let session = bambuSessions.get(deviceId);
  if (!session || session.closed) {
    session = {
      deviceId,
      host: String(input.host ?? '').trim(),
      port: Number(input.port) || 8883,
      serialNumber: String(input.serialNumber ?? '').trim(),
      accessCode: String(input.accessCode ?? ''),
      closed: false,
      phase: 'connecting',
      reason: '',
      authFailed: false,
      print: {},
      readings: null,
      socket: null,
      timer: null,
    };
    bambuSessions.set(deviceId, session);
    connectBambuSession(session);
    return sessionView(session);
  }
  session.host = String(input.host ?? session.host).trim();
  session.port = Number(input.port) || session.port;
  session.serialNumber = String(input.serialNumber ?? session.serialNumber).trim();
  session.accessCode = String(input.accessCode ?? session.accessCode);
  if (!session.socket) connectBambuSession(session);
  return sessionView(session);
}

function readBambuSession(deviceId) {
  const session = bambuSessions.get(String(deviceId ?? '').trim());
  if (!session || session.closed) return { phase: 'offline', reason: '连接已断开', readings: null, present: false };
  return sessionView(session);
}

function closeBambuSession(deviceId) {
  const session = bambuSessions.get(String(deviceId ?? '').trim());
  if (!session) return;
  session.closed = true;
  if (session.timer) clearTimeout(session.timer);
  session.socket?.destroy();
  bambuSessions.delete(session.deviceId);
}

module.exports = {
  MQTT_AUTH_FAILED_MESSAGE,
  MQTT_FAILED_MESSAGE,
  MQTT_NO_REPORT_MESSAGE,
  extractBambuSerialToken,
  identifyBambuSerial,
  isPrivateIpv4,
  parseBambuSsdpMessage,
  probeBambuCertificate,
  probeBambuMqtt,
  projectBambuReadings,
  publishPacket,
  serialFromPeerCertificate,
  takeMqttPacket,
  openBambuSession,
  readBambuSession,
  closeBambuSession,
};
