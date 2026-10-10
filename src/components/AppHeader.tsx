import { Info, Plus } from 'lucide-react-native';
import { Platform, Pressable, StatusBar as RNStatusBar, Text, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrinterCard } from '@/src/types/printer';

export function AppHeader({
  printers,
  printingCount,
  onScan,
  onOpenDetail,
}: {
  printers: PrinterCard[];
  printingCount: number;
  onScan: () => void;
  onOpenDetail: () => void;
}) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    initialWindowMetrics?.insets.top ?? 0,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  );
  const onlineCount = printers.filter((printer) => printer.status !== 'offline' && printer.status !== 'connecting').length;
  const connectingCount = printers.filter((printer) => printer.status === 'connecting').length;
  const linkSummary =
    printers.length === 0
      ? '已添加 0 台设备'
      : onlineCount > 0
        ? `已添加 ${printers.length} 台设备 · 已连接 ${onlineCount} 台`
        : connectingCount > 0
          ? `已添加 ${printers.length} 台设备 · 正在连接`
          : `已添加 ${printers.length} 台设备 · 未连接`;

  return (
    <View style={{ paddingTop: topInset, zIndex: 20 }} className="border-b border-line bg-card">
      <View className="flex-row items-center gap-2 px-2.5 py-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2 rounded-xl px-1.5 py-1">
          <View className={`h-2.5 w-2.5 rounded-full ${printingCount > 0 ? 'bg-brand' : onlineCount > 0 ? 'bg-deep' : 'bg-[#C5C3D1]'}`} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-ink" numberOfLines={1}>
              设备总览
            </Text>
            <Text className="font-mono text-[11px] text-muted" numberOfLines={1}>
              {linkSummary}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel="添加设备"
          onPress={onScan}
          className="flex-row items-center gap-1 rounded-xl bg-brand px-2 py-1.5">
          <Plus color="#101010" size={16} strokeWidth={2.5} />
          <Text className="text-sm font-semibold text-ink">添加设备</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="设备详情"
          onPress={onOpenDetail}
          className="rounded-xl border border-line bg-soft p-2">
          <Info color="#26225F" size={16} />
        </Pressable>
      </View>
    </View>
  );
}
