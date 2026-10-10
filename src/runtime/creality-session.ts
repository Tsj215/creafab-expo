import { Readings, applyCrealityMessage } from '@/src/runtime/creality-snapshot';
import { CREALITY_CONNECT_TIMEOUT_MS } from '@/src/runtime/types';

export type CrealitySocket = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
};

const BOOTSTRAP = JSON.stringify(
  {
    method: 'get',
    params: {
      printerInfo: 1,
      boxsInfo: 1,
      ReqPrinterPara: 1,
      reqMaterials: 1,
      reqGcodeFile: 1,
    },
  },
  null,
  2,
);

export function crealitySocketUrl(ipAddress: string, wsPort: number) {
  return `ws://${ipAddress}:${wsPort}`;
}

export function openCrealitySession(input: {
  url: string;
  timeoutMs?: number;
  onSnapshot: (readings: Readings) => void;
  onFailed: (reason: string) => void;
  openSocket?: (url: string) => CrealitySocket;
}) {
  const timeoutMs = input.timeoutMs ?? CREALITY_CONNECT_TIMEOUT_MS;
  const target = input.url.replace(/^ws:\/\//, '');
  const socket = (input.openSocket ?? openWebSocket)(input.url);
  let retired = false;
  let online = false;
  let bootstrapSent = false;
  let readings: Readings | null = null;

  const timer = setTimeout(() => fail(`连接 ${target} 超时`), timeoutMs);

  const finish = () => {
    clearTimeout(timer);
  };

  function fail(reason: string) {
    if (retired || online) return;
    retired = true;
    finish();
    input.onFailed(reason);
    socket.close();
  }

  function publish(next: Readings) {
    readings = next;
    if (!bootstrapSent) return;
    if (!online) {
      online = true;
      finish();
    }
    input.onSnapshot(next);
  }

  socket.onopen = () => {
    if (retired) return;
    try {
      socket.send(BOOTSTRAP);
    } catch {
      fail(`无法连接到 ${target}`);
      return;
    }
    bootstrapSent = true;
    if (readings) publish(readings);
  };

  socket.onmessage = (event) => {
    if (retired) return;
    const raw = typeof event.data === 'string' ? event.data : '';
    if (!raw) return;
    const next = applyCrealityMessage(readings, raw);
    if (next) publish(next);
  };

  socket.onerror = () => {
    if (online) return;
    fail(`无法连接到 ${target}`);
  };

  socket.onclose = () => {
    if (retired) return;
    if (!online) {
      fail(`连接 ${target} 已断开`);
      return;
    }
    retired = true;
    finish();
    input.onFailed('连接已断开');
  };

  return {
    close() {
      if (retired) return;
      retired = true;
      finish();
      socket.close();
    },
  };
}

function openWebSocket(url: string): CrealitySocket {
  const socket = new WebSocket(url);
  const wrapper: CrealitySocket = {
    send(data) {
      socket.send(data);
    },
    close() {
      socket.close();
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };
  socket.addEventListener('open', () => wrapper.onopen?.());
  socket.addEventListener('message', (event) => wrapper.onmessage?.(event));
  socket.addEventListener('error', () => wrapper.onerror?.());
  socket.addEventListener('close', () => wrapper.onclose?.());
  return wrapper;
}
