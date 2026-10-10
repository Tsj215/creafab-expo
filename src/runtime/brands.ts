/** 与 creafab-one 打印机品牌目录一致。创想走局域网扫描，拓竹走 IP 和访问码。 */

export type DeviceBrand = {
  id: string;
  code: string;
  name: string;
  driver: 'creality' | 'bambu' | 'snapmaker' | 'flashforge' | 'anycubic';
  ready: boolean;
};

export const DEVICE_BRANDS: DeviceBrand[] = [
  { id: 'printer-brand-creality', code: 'creality', name: '创想三维 Creality', driver: 'creality', ready: true },
  { id: 'printer-brand-bambu', code: 'bambu-lab', name: '拓竹 Bambu Lab', driver: 'bambu', ready: true },
  { id: 'printer-brand-snapmaker', code: 'snapmaker', name: 'Snapmaker', driver: 'snapmaker', ready: false },
  { id: 'printer-brand-flashforge', code: 'flashforge', name: '闪铸 Flashforge', driver: 'flashforge', ready: false },
  { id: 'printer-brand-anycubic', code: 'anycubic', name: '纵维立方 Anycubic', driver: 'anycubic', ready: false },
];

export function findDeviceBrand(id: string) {
  return DEVICE_BRANDS.find((brand) => brand.id === id) ?? null;
}
