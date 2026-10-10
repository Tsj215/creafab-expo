/** 从创想屏幕全文里只读取一个局域网 IPv4。不连接设备。 */

import { isPrivateIpv4 } from '@/src/runtime/net';

export function parseCrealityScreen(raw: string): { ip: string } {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (!isIpLabel(lines[index])) continue;
    const onLine = firstPrivate(lines[index]);
    if (onLine) return { ip: onLine };
    const next = firstPrivate(lines[index + 1] ?? '');
    if (next) return { ip: next };
  }
  return { ip: firstPrivate(raw) };
}

function isIpLabel(line: string) {
  return /ip\s*地址|(?:^|[^a-z])ip(?:[^a-z]|$)/i.test(line);
}

function firstPrivate(text: string) {
  const found = text.matchAll(/(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)/g);
  for (const match of found) {
    if (isPrivateIpv4(match[0])) return match[0];
  }
  return '';
}
