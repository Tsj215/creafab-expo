export function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return numbers as [number, number, number, number];
}

export function formatIpv4(value: string) {
  const parsed = parseIpv4(value);
  return parsed ? parsed.join('.') : null;
}

export function isPrivateIpv4(value: string) {
  const ip = parseIpv4(value);
  if (!ip) return false;
  const [a, b] = ip;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function parsePort(value: string, fallback: number) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (port < 1 || port > 65535) return null;
  return port;
}

export type ScanSegments = {
  a: string;
  b: string;
  c: string;
  d: string;
};

export function defaultScanSegments(address: string): ScanSegments {
  const ip = parseIpv4(address);
  if (!ip) return { a: '192', b: '168', c: '1', d: '' };
  return { a: String(ip[0]), b: String(ip[1]), c: String(ip[2]), d: '' };
}

function octet(value: string) {
  const text = value.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const number = Number(text);
  if (number < 0 || number > 255) return null;
  return number;
}

function hostBounds(value: string) {
  const text = value.trim();
  if (!text) return { start: 1, end: 254 };
  const match = text.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1 || end > 254 || end < start) return null;
  return { start, end };
}

export function resolveScanHosts(
  segments: ScanSegments,
  ownAddress: string,
): { hosts: string[]; label: string } | { error: string } {
  const a = octet(segments.a);
  const b = octet(segments.b);
  const c = octet(segments.c);
  if (a === null || b === null || c === null) {
    return { error: '请填写网段前三段，每段为 0 到 255' };
  }
  const prefix = `${a}.${b}.${c}`;
  if (!isPrivateIpv4(`${prefix}.1`)) return { error: '只能扫描局域网网段' };
  const bounds = hostBounds(segments.d);
  if (!bounds) return { error: '末段留空，或填写 1 到 254 的地址或范围' };

  const hosts = buildScanHosts(prefix, ownAddress, bounds.start, bounds.end);
  if (hosts.length === 0) return { error: '这个范围内没有可扫描的地址' };
  const label =
    bounds.start === 1 && bounds.end === 254
      ? `${prefix}.0/24`
      : bounds.start === bounds.end
        ? `${prefix}.${bounds.start}`
        : `${prefix}.${bounds.start}-${bounds.end}`;
  return { hosts, label };
}

export function buildScanHosts(prefix: string, ownAddress: string, start = 1, end = 254) {
  const own = parseIpv4(ownAddress);
  const ownHost = own && `${own[0]}.${own[1]}.${own[2]}` === prefix ? own[3] : null;
  const hosts: string[] = [];
  for (let host = start; host <= end; host += 1) {
    if (host === ownHost) continue;
    hosts.push(`${prefix}.${host}`);
  }
  return hosts;
}

export function compareIpv4(left: string, right: string) {
  const a = parseIpv4(left);
  const b = parseIpv4(right);
  if (!a || !b) return left.localeCompare(right);
  for (let index = 0; index < 4; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
