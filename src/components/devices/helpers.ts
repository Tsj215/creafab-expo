import { PrinterStatus } from '@/src/types/printer';

export function formatRemain(sec: number) {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}分`;
}

export function machineCode(name: string, ip: string) {
  const match = name.match(/#([A-Z0-9]+)/);
  if (match) return match[1];
  return ip.split('.').pop() || name.slice(0, 3);
}

export function rackLetter(name: string) {
  const match = name.match(/#([A-Z])/);
  return match?.[1] ?? null;
}

export const STATUS_COLOR: Record<PrinterStatus, string> = {
  printing: '#2AB381',
  paused: '#B86E00',
  heating: '#26225F',
  completed: '#2AB381',
  standby: '#4A4863',
  error: '#C4454A',
  connecting: '#26225F',
  offline: '#C5C3D1',
};

export function liveReading(status: PrinterStatus, value: string) {
  return status === 'offline' || status === 'connecting' ? '—' : value;
}

export function idleCaption(status: PrinterStatus, note = '') {
  if (status === 'connecting') return '正在连接';
  if (status === 'offline') return note.trim() || '未连接';
  if (status === 'standby') return '已连接';
  return statusLabel(status);
}

export function statusLabel(status: PrinterStatus) {
  switch (status) {
    case 'printing':
      return '正在打印';
    case 'paused':
      return '已暂停';
    case 'heating':
      return '预热中';
    case 'completed':
      return '已完成';
    case 'error':
      return '异常';
    case 'offline':
      return '未连接';
    case 'connecting':
      return '正在连接';
    default:
      return '空闲待机';
  }
}

export const STATUS_RANK: Record<PrinterStatus, number> = {
  printing: 1,
  paused: 2,
  heating: 3,
  error: 4,
  standby: 5,
  completed: 6,
  offline: 7,
  connecting: 8,
};
