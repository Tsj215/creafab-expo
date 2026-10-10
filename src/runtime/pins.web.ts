const KEY = 'creafab.device-pins';

function parsePinnedIds(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  } catch {
    return [];
  }
}

export async function loadPinnedIds() {
  if (typeof localStorage === 'undefined') return [];
  return parsePinnedIds(localStorage.getItem(KEY));
}

export async function savePinnedIds(ids: readonly string[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(ids));
}
