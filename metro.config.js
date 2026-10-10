const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const {
  closeBambuSession,
  isPrivateIpv4,
  openBambuSession,
  identifyBambuSerial,
  probeBambuMqtt,
  readBambuSession,
} = require('./scripts/bambu-cert-probe.cjs');

const config = getDefaultConfig(__dirname);

// Keep wasm resolvable. The web archive does not import expo-sqlite: Metro's
// static dev bundle cannot emit that library's worker chunk.
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (used by expo-sqlite on web) requires these headers.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/__creafab/bambu-mqtt-test') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          body = {};
        }
        const ip = String(body.ip ?? '');
        const port = Number(body.port || 8883);
        const serialNumber = String(body.serialNumber ?? '').trim();
        const accessCode = String(body.accessCode ?? '');
        const send = (result) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        };
        if (!isPrivateIpv4(ip) || !serialNumber || !accessCode || !Number.isInteger(port) || port < 1 || port > 65535) {
          send({ ok: false, message: '连接测试失败，请检查 IP / 序列号 / 访问码。' });
          return;
        }
        void probeBambuMqtt({ host: ip, port, serialNumber, accessCode, timeoutMs: 15000 }).then(send);
      });
      return;
    }
    if (url.pathname === '/__creafab/bambu-session') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          body = {};
        }
        const deviceId = String(body.deviceId ?? '').trim();
        const action = String(body.action ?? 'read');
        const send = (result) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        };
        if (!deviceId) {
          send({ phase: 'offline', reason: '连接测试失败，请检查 IP / 序列号 / 访问码。', readings: null, present: true });
          return;
        }
        if (action === 'close') {
          closeBambuSession(deviceId);
          send({ phase: 'offline', reason: '', readings: null, present: false });
          return;
        }
        if (action === 'read') {
          send(readBambuSession(deviceId));
          return;
        }
        const ip = String(body.ip ?? '');
        const port = Number(body.port || 8883);
        const serialNumber = String(body.serialNumber ?? '').trim();
        const accessCode = String(body.accessCode ?? '');
        if (!isPrivateIpv4(ip) || !serialNumber || !accessCode || !Number.isInteger(port) || port < 1 || port > 65535) {
          send({ phase: 'offline', reason: '连接测试失败，请检查 IP / 序列号 / 访问码。', readings: null, present: true });
          return;
        }
        closeBambuSession(deviceId);
        send(openBambuSession({ deviceId, host: ip, port, serialNumber, accessCode }));
      });
      return;
    }
    if (url.pathname !== '/__creafab/bambu-identify') {
      return middleware(req, res, next);
    }
    const ip = url.searchParams.get('ip') ?? '';
    const port = Number(url.searchParams.get('port') || '8883');
    if (!isPrivateIpv4(ip) || !Number.isInteger(port) || port < 1 || port > 65535) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ serialNumber: '' }));
      return;
    }
    void identifyBambuSerial({ host: ip, port, tcpTimeoutMs: 4000, tlsTimeoutMs: 6000, ssdpTimeoutMs: 2500 }).then((serialNumber) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ serialNumber }));
    });
  };
};

module.exports = withNativeWind(config, { input: './global.css' });
