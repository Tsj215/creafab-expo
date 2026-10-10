import { Image, ImageSourcePropType } from 'react-native';

import { crealityThumbnailFile } from '@/src/runtime/creality-thumbnail';

const FILES: Record<string, ImageSourcePropType> = {
  'cr-10-se.png': require('@/assets/printers/creality/cr-10-se.png'),
  'cr-10-smart-pro.png': require('@/assets/printers/creality/cr-10-smart-pro.png'),
  'cr-10-smart.png': require('@/assets/printers/creality/cr-10-smart.png'),
  'cr-10.png': require('@/assets/printers/creality/cr-10.png'),
  'cr-10s-pro-v2.png': require('@/assets/printers/creality/cr-10s-pro-v2.png'),
  'cr-20-pro.png': require('@/assets/printers/creality/cr-20-pro.png'),
  'cr-30.png': require('@/assets/printers/creality/cr-30.png'),
  'cr-6-se.png': require('@/assets/printers/creality/cr-6-se.png'),
  'cr-m4-se.png': require('@/assets/printers/creality/cr-m4-se.png'),
  'cr-m4.png': require('@/assets/printers/creality/cr-m4.png'),
  'ender-2-pro.png': require('@/assets/printers/creality/ender-2-pro.png'),
  'ender-3-max-neo.png': require('@/assets/printers/creality/ender-3-max-neo.png'),
  'ender-3-max.png': require('@/assets/printers/creality/ender-3-max.png'),
  'ender-3-neo.png': require('@/assets/printers/creality/ender-3-neo.png'),
  'ender-3-s1-plus.png': require('@/assets/printers/creality/ender-3-s1-plus.png'),
  'ender-3-s1-pro.png': require('@/assets/printers/creality/ender-3-s1-pro.png'),
  'ender-3-s1.png': require('@/assets/printers/creality/ender-3-s1.png'),
  'ender-3-v2.png': require('@/assets/printers/creality/ender-3-v2.png'),
  'ender-3-v3-ke.png': require('@/assets/printers/creality/ender-3-v3-ke.png'),
  'ender-3-v3-plus.png': require('@/assets/printers/creality/ender-3-v3-plus.png'),
  'ender-3-v3-se.png': require('@/assets/printers/creality/ender-3-v3-se.png'),
  'ender-3-v3.png': require('@/assets/printers/creality/ender-3-v3.png'),
  'ender-3-v4.png': require('@/assets/printers/creality/ender-3-v4.png'),
  'ender-3.png': require('@/assets/printers/creality/ender-3.png'),
  'ender-5-max.png': require('@/assets/printers/creality/ender-5-max.png'),
  'ender-5-plus.png': require('@/assets/printers/creality/ender-5-plus.png'),
  'ender-5-s1.png': require('@/assets/printers/creality/ender-5-s1.png'),
  'gs-01.png': require('@/assets/printers/creality/gs-01.png'),
  'gs-02.png': require('@/assets/printers/creality/gs-02.png'),
  'gs-03.png': require('@/assets/printers/creality/gs-03.png'),
  'hi.png': require('@/assets/printers/creality/hi.png'),
  'k1-cfs-c.png': require('@/assets/printers/creality/k1-cfs-c.png'),
  'k1-max-2025-cfs-c.png': require('@/assets/printers/creality/k1-max-2025-cfs-c.png'),
  'k1-max-cfs-c.png': require('@/assets/printers/creality/k1-max-cfs-c.png'),
  'k1-max.png': require('@/assets/printers/creality/k1-max.png'),
  'k1-se-cfs-c.png': require('@/assets/printers/creality/k1-se-cfs-c.png'),
  'k1-se.png': require('@/assets/printers/creality/k1-se.png'),
  'k1.png': require('@/assets/printers/creality/k1.png'),
  'k1c-2025-cfs-c.png': require('@/assets/printers/creality/k1c-2025-cfs-c.png'),
  'k1c-cfs-c.png': require('@/assets/printers/creality/k1c-cfs-c.png'),
  'k1c.png': require('@/assets/printers/creality/k1c.png'),
  'k2-plus.png': require('@/assets/printers/creality/k2-plus.png'),
  'k2-pro.png': require('@/assets/printers/creality/k2-pro.png'),
  'k2-se.png': require('@/assets/printers/creality/k2-se.png'),
  'k2.png': require('@/assets/printers/creality/k2.png'),
  'sermoon-d3-pro.png': require('@/assets/printers/creality/sermoon-d3-pro.png'),
  'sermoon-d3.png': require('@/assets/printers/creality/sermoon-d3.png'),
  'sermoon-m300.png': require('@/assets/printers/creality/sermoon-m300.png'),
  'sermoon-v1-pro.png': require('@/assets/printers/creality/sermoon-v1-pro.png'),
  'sonic-ender-3-s1.png': require('@/assets/printers/creality/sonic-ender-3-s1.png'),
  'sonic-ender-5-s1.png': require('@/assets/printers/creality/sonic-ender-5-s1.png'),
  'sparkx-i7.png': require('@/assets/printers/creality/sparkx-i7.png'),
};

export function crealityModelImage(model: string): ImageSourcePropType | null {
  const file = crealityThumbnailFile(model);
  return file ? FILES[file] ?? null : null;
}

export function ModelThumb({ model, size }: { model: string; size: number }) {
  const source = crealityModelImage(model);
  if (!source) return null;
  return <Image source={source} resizeMode="contain" style={{ width: size, height: size }} />;
}
