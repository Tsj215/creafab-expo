/** 从拓竹屏幕全文里读取 IP 和访问码。不连接设备。 */

export type DeviceIdentity = {
  ip: string;
  code: string;
};

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

export function parseBambuScreen(raw: string): DeviceIdentity {
  const json = readJsonObject(raw);
  let ip = normalizeIp(json?.ip);
  let code = normalizeCode(json?.code);
  if (!ip) {
    const found = raw.match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/);
    ip = found?.[0] ?? '';
  }
  if (!code) code = accessCodeFromText(raw);
  return { ip, code };
}

function accessCodeFromText(raw: string) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inline = line.match(/(?:访问码|识别码|access\s*code)\s*[:：]?\s*([A-Za-z0-9-][A-Za-z0-9-\s]{2,24})/i);
    const inlineCode = inline?.[1]?.replace(/\s+/g, '') ?? '';
    if (/^[A-Za-z0-9-]{4,16}$/.test(inlineCode)) return inlineCode;
    if (/(?:访问码|识别码|access\s*code)\s*[:：]?\s*$/i.test(line)) {
      const next = lines[index + 1]?.replace(/\s+/g, '') ?? '';
      if (/^[A-Za-z0-9-]{4,16}$/.test(next)) return next;
    }
  }
  return '';
}

function readJsonObject(raw: string): { ip?: unknown; code?: unknown } | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as { ip?: unknown; code?: unknown };
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function normalizeIp(value: unknown): string {
  const text = String(value ?? '')
    .trim()
    .replace(/:\d{1,5}$/, '')
    .replace(/\s+/g, '');
  return IPV4.test(text) ? text : '';
}

function normalizeCode(value: unknown): string {
  const text = String(value ?? '')
    .trim()
    .replace(/\s+/g, '');
  return /^[A-Za-z0-9-]{2,32}$/.test(text) ? text : '';
}
