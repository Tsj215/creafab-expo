export type Readings = {
  stateCode: number | null;
  nozzle: { current: number; target: number };
  bed: { current: number; target: number };
  progress: number | null;
  taskName: string;
  remainingSec: number | null;
  currentLayer: number | null;
  totalLayers: number | null;
};

const EMPTY_READINGS: Readings = {
  stateCode: null,
  nozzle: { current: 0, target: 0 },
  bed: { current: 0, target: 0 },
  progress: null,
  taskName: '',
  remainingSec: null,
  currentLayer: null,
  totalLayers: null,
};

export function applyCrealityMessage(previous: Readings | null, raw: string): Readings | null {
  if (isHeartbeat(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const view = flatten(parsed as Record<string, unknown>);
  const patch = readPatch(view);
  if (!patch) return null;
  return merge(previous ?? EMPTY_READINGS, patch);
}

function isHeartbeat(raw: string) {
  const normalized = raw.trim().toLowerCase();
  return normalized.includes('heart_beat') || (normalized.includes('heartbeat') && normalized.includes('modecode'));
}

function flatten(payload: Record<string, unknown>) {
  const nested = payload.params ?? payload.result ?? payload.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...(nested as Record<string, unknown>), ...payload };
  }
  return payload;
}

type Patch = {
  stateCode?: number;
  nozzleCurrent?: number;
  nozzleTarget?: number;
  bedCurrent?: number;
  bedTarget?: number;
  progress?: number;
  taskName?: string;
  remainingSec?: number;
  currentLayer?: number;
  totalLayers?: number;
};

function readPatch(view: Record<string, unknown>): Patch | null {
  const patch: Patch = {};
  const stateCode = readNumber(view, ['state']);
  const nozzleCurrent = scaleTemp(readNumber(view, ['nozzleTemp', 'nozzle_temperature', 'nozzle_temp', 'hotend_temp', 'extruder_temp']));
  const nozzleTarget = scaleTemp(readNumber(view, ['targetNozzleTemp', 'target_nozzle_temp', 'targetHotendTemp']));
  const bedCurrent = scaleTemp(readNumber(view, ['bedTemp0', 'bedTemp', 'bed_temperature', 'bed_temp', 'platform_temp', 'hotbed_temp']));
  const bedTarget = scaleTemp(readNumber(view, ['targetBedTemp0', 'targetBedTemp', 'target_bed_temp']));
  const progress = readNumber(view, ['printProgress', 'progress']);
  const taskName = readText(view, ['printFileName', 'print_file_name', 'task_name', 'job_name', 'file_name']);
  const remainingSec = readNumber(view, ['printLeftTime', 'time_left_sec']);
  const remainingMin = readNumber(view, ['remaining_minutes', 'remaining_time', 'remain_minutes', 'time_left', 'time_left_min']);
  const currentLayer = readNumber(view, ['layer', 'current_layer', 'layer_num', 'workingLayer']);
  const totalLayers = readNumber(view, ['TotalLayer', 'totalLayer', 'totalLayers', 'total_layers', 'layer_count']);

  if (stateCode !== null) patch.stateCode = stateCode;
  if (nozzleCurrent !== null) patch.nozzleCurrent = nozzleCurrent;
  if (nozzleTarget !== null) patch.nozzleTarget = nozzleTarget;
  if (bedCurrent !== null) patch.bedCurrent = bedCurrent;
  if (bedTarget !== null) patch.bedTarget = bedTarget;
  if (progress !== null) patch.progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (taskName) patch.taskName = taskName.split(/[\\/]/).filter(Boolean).pop() ?? taskName;
  if (remainingSec !== null) patch.remainingSec = Math.max(0, Math.round(remainingSec));
  else if (remainingMin !== null) patch.remainingSec = Math.max(0, Math.round(remainingMin * 60));
  if (currentLayer !== null) patch.currentLayer = Math.max(0, Math.round(currentLayer));
  if (totalLayers !== null) patch.totalLayers = Math.max(0, Math.round(totalLayers));

  return Object.keys(patch).length > 0 ? patch : null;
}

function merge(previous: Readings, patch: Patch): Readings {
  return {
    stateCode: patch.stateCode ?? previous.stateCode,
    nozzle: {
      current: patch.nozzleCurrent ?? previous.nozzle.current,
      target: patch.nozzleTarget ?? previous.nozzle.target,
    },
    bed: {
      current: patch.bedCurrent ?? previous.bed.current,
      target: patch.bedTarget ?? previous.bed.target,
    },
    progress: patch.progress ?? previous.progress,
    taskName: patch.taskName ?? previous.taskName,
    remainingSec: patch.remainingSec ?? previous.remainingSec,
    currentLayer: patch.currentLayer ?? previous.currentLayer,
    totalLayers: patch.totalLayers ?? previous.totalLayers,
  };
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function readText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function scaleTemp(value: number | null) {
  if (value === null) return null;
  return value > 1000 ? value / 100 : value;
}
