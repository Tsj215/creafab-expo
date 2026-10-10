import { resolveCrealityModelCode } from '@/src/runtime/creality-model';

/** 创想内部代号到机型缩略图，对应 creafab-one 的 internal-model-map 与 printer-images。 */

const MODEL_FILE: Record<string, string> = {
  'CR-10': 'cr-10.png',
  'CR-10 Smart': 'cr-10-smart.png',
  'CR-10 Smart Pro': 'cr-10-smart-pro.png',
  'CR-10S Pro V2': 'cr-10s-pro-v2.png',
  'CR-20 Pro': 'cr-20-pro.png',
  'CR-30': 'cr-30.png',
  'CR-6 SE': 'cr-6-se.png',
  'CR-K1': 'k1.png',
  'CR-K1 Max': 'k1-max.png',
  'CR-M4': 'cr-m4.png',
  'Ender-2 Pro': 'ender-2-pro.png',
  'Ender-3': 'ender-3.png',
  'Ender-3 Max': 'ender-3-max.png',
  'Ender-3 Max Neo': 'ender-3-max-neo.png',
  'Ender-3 Neo': 'ender-3-neo.png',
  'Ender-3 S1': 'ender-3-s1.png',
  'Ender-3 S1 Plus': 'ender-3-s1-plus.png',
  'Ender-3 S1 Pro': 'ender-3-s1-pro.png',
  'Ender-3 V2': 'ender-3-v2.png',
  'Ender-3 V3 SE': 'ender-3-v3-se.png',
  'Ender-5 Plus': 'ender-5-plus.png',
  'Ender-5 S1': 'ender-5-s1.png',
  F001: 'ender-3-v3.png',
  F002: 'ender-3-v3-plus.png',
  F003: 'cr-10-se.png',
  F004: 'ender-5-max.png',
  F005: 'ender-3-v3-ke.png',
  F006: 'cr-m4-se.png',
  F008: 'k2-plus.png',
  F009: 'ender-3-v4.png',
  F012: 'k2-pro.png',
  F016: 'k2-se.png',
  F018: 'hi.png',
  F021: 'k2.png',
  F022: 'sparkx-i7.png',
  F025: 'sermoon-m300.png',
  F029: 'gs-03.png',
  'Fast-Ender-3 S1': 'sonic-ender-3-s1.png',
  'Fast-Ender-5 S1': 'sonic-ender-5-s1.png',
  'GS-01': 'gs-01.png',
  'GS-02': 'gs-02.png',
  'K1 Max 2025_CFS-C': 'k1-max-2025-cfs-c.png',
  'K1 Max_CFS-C': 'k1-max-cfs-c.png',
  'K1 SE': 'k1-se.png',
  'K1 SE_CFS-C': 'k1-se-cfs-c.png',
  K1C: 'k1c.png',
  'K1C 2025_CFS-C': 'k1c-2025-cfs-c.png',
  'K1C_CFS-C': 'k1c-cfs-c.png',
  'K1_CFS-C': 'k1-cfs-c.png',
  'Sermoon D3': 'sermoon-d3.png',
  'Sermoon D3 Pro': 'sermoon-d3-pro.png',
  'Sermoon V1 Pro': 'sermoon-v1-pro.png',
};

function fileForKey(key: string) {
  if (MODEL_FILE[key]) return MODEL_FILE[key];
  const folded = key.toLowerCase();
  const matched = Object.keys(MODEL_FILE).find((item) => item.toLowerCase() === folded);
  return matched ? MODEL_FILE[matched] : null;
}

export function crealityThumbnailFile(model: string) {
  const key = model.trim();
  if (!key) return null;
  return fileForKey(key) ?? fileForKey(resolveCrealityModelCode(key)) ?? null;
}
