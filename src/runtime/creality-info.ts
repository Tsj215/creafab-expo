import { CrealityInfo } from '@/src/runtime/types';

export class ProbeError extends Error {
  constructor(
    readonly reason: 'timeout' | 'cancelled' | 'http' | 'invalid' | 'not-printer' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'ProbeError';
  }
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function parseCrealityInfo(payload: unknown): CrealityInfo {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ProbeError('invalid', '打印机响应无法解析');
  }
  const record = payload as Record<string, unknown>;
  const info: CrealityInfo = {
    mac: readString(record, 'mac'),
    model: readString(record, 'model'),
    serialNumber: readString(record, 'sn'),
    firmware: readString(record, 'version'),
    hostname: readString(record, 'hostname'),
  };
  if (!info.mac && !info.model && !info.serialNumber && !info.hostname) {
    throw new ProbeError('not-printer', '这台地址没有返回创想设备信息');
  }
  return info;
}

export function crealityInfoUrl(ipAddress: string, httpPort: number) {
  return httpPort === 80 ? `http://${ipAddress}/info` : `http://${ipAddress}:${httpPort}/info`;
}

function requestText(url: string, timeoutMs: number, signal: AbortSignal | undefined, target: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProbeError('cancelled', '扫描已停止'));
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    const fail = (error: ProbeError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = (status: number, body: string) => {
      if (settled) return;
      settled = true;
      resolve({ status, body });
    };

    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      if (xhr.status === 0) {
        fail(new ProbeError('network', `无法连接到 ${target}`));
        return;
      }
      succeed(xhr.status, xhr.responseText ?? '');
    };
    xhr.onerror = () => fail(new ProbeError('network', `无法连接到 ${target}`));
    xhr.ontimeout = () => fail(new ProbeError('timeout', `连接 ${target} 超时`));
    xhr.onabort = () => fail(new ProbeError(signal?.aborted ? 'cancelled' : 'timeout', signal?.aborted ? '扫描已停止' : `连接 ${target} 超时`));

    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort);
    xhr.addEventListener('loadend', () => signal?.removeEventListener('abort', abort));

    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send();
  });
}

export async function probeCreality(
  ipAddress: string,
  httpPort: number,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<CrealityInfo> {
  const target = `${ipAddress}:${httpPort}`;
  const { status, body } = await requestText(crealityInfoUrl(ipAddress, httpPort), timeoutMs, signal, target);
  if (status < 200 || status >= 300) {
    throw new ProbeError('http', `无法读取设备信息（HTTP ${status}）`);
  }
  try {
    return parseCrealityInfo(JSON.parse(body) as unknown);
  } catch (error) {
    if (error instanceof ProbeError) throw error;
    throw new ProbeError('invalid', '打印机响应无法解析');
  }
}
