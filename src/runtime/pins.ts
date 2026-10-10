import { getDatabase } from '@/src/runtime/db';

const KEY = 'device-pins';

function parsePinnedIds(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  } catch {
    return [];
  }
}

async function stateDatabase() {
  const db = await getDatabase();
  await db.execAsync('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  return db;
}

export async function loadPinnedIds() {
  const db = await stateDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_state WHERE key = ?', KEY);
  return parsePinnedIds(row?.value);
}

export async function savePinnedIds(ids: readonly string[]) {
  const db = await stateDatabase();
  await db.runAsync(
    'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    KEY,
    JSON.stringify(ids),
  );
}
