/** 创想内部代号 → 对外展示名，与 creafab-one internal-model-map 一致。未收录的代号原样返回。 */

const DISPLAY_NAME: Record<string, string> = {
  'CR-6 SE': 'CR-6 SE',
  'CR-10': 'CR-10',
  'CR-10 Smart': 'CR-10 Smart',
  'CR-10 Smart Pro': 'CR-10 Smart Pro',
  'CR-10S Pro V2': 'CR-10S Pro V2',
  'CR-20 Pro': 'CR-20 Pro',
  'CR-30': 'CR-30',
  'CR-K1': 'K1',
  'CR-K1 Max': 'K1 Max',
  'CR-M4': 'CR-M4',
  'Ender-2 Pro': 'Ender-2 Pro',
  'Ender-3': 'Ender-3',
  'Ender-3 Max': 'Ender-3 Max',
  'Ender-3 Max Neo': 'Ender-3 Max Neo',
  'Ender-3 Neo': 'Ender-3 Neo',
  'Ender-3 S1': 'Ender-3 S1',
  'Ender-3 S1 Plus': 'Ender-3 S1 Plus',
  'Ender-3 S1 Pro': 'Ender-3 S1 Pro',
  'Ender-3 V2': 'Ender-3 V2',
  'Ender-3 V3 SE': 'Ender-3 V3 SE',
  'Ender-5 Plus': 'Ender-5 Plus',
  'Ender-5 S1': 'Ender-5 S1',
  F001: 'Ender-3 V3',
  F002: 'Ender-3 V3 Plus',
  F003: 'CR-10 SE',
  F004: 'Ender-5 Max',
  F005: 'Ender-3 V3 KE',
  F006: 'CR-M4 SE',
  F008: 'K2 Plus',
  F009: 'Ender-3 V4',
  F012: 'K2 Pro',
  F016: 'K2 SE',
  F018: 'Creality Hi',
  F021: 'K2',
  F022: 'SPARKX i7',
  F025: 'Sermoon M300',
  F029: 'GS-03',
  'Fast-Ender-3 S1': 'Sonic_Ender-3 S1',
  'Fast-Ender-5 S1': 'Sonic_Ender-5 S1',
  'GS-01': 'GS-01',
  'GS-02': 'GS-02',
  'K1 Max 2025_CFS-C': 'K1 Max 2025_CFS-C',
  'K1 Max_CFS-C': 'K1 Max_CFS-C',
  'K1 SE': 'K1 SE',
  'K1 SE_CFS-C': 'K1 SE_CFS-C',
  'K1_CFS-C': 'K1_CFS-C',
  K1C: 'K1C',
  'K1C 2025_CFS-C': 'K1C 2025_CFS-C',
  'K1C_CFS-C': 'K1C_CFS-C',
  'Sermoon D3': 'Sermoon D3',
  'Sermoon D3 Pro': 'Sermoon D3 Pro',
  'Sermoon V1 Pro': 'Sermoon V1 Pro',
};

function matchedKey(value: string) {
  if (DISPLAY_NAME[value]) return value;
  const folded = value.toLowerCase();
  return Object.keys(DISPLAY_NAME).find((item) => item.toLowerCase() === folded) ?? '';
}

export function resolveCrealityDisplayModel(value: string | undefined) {
  const key = value?.trim() ?? '';
  if (!key) return '';
  const matched = matchedKey(key);
  return matched ? DISPLAY_NAME[matched] : key;
}

export function resolveCrealityModelCode(value: string | undefined) {
  const key = value?.trim() ?? '';
  if (!key) return '';
  const matched = matchedKey(key);
  if (matched) return matched;
  const folded = key.toLowerCase();
  return (
    Object.keys(DISPLAY_NAME).find((item) => DISPLAY_NAME[item].toLowerCase() === folded) ?? ''
  );
}
