import { Camera, Plus } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StatusBar as RNStatusBar, Text, useWindowDimensions, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddDeviceIcon } from '@/src/components/icons/AddDeviceIcon';
import { PrinterCard } from '@/src/types/printer';

export function AppHeader({
  printers,
  printingCount,
  onAddDevice,
  onScanPhoto,
}: {
  printers: PrinterCard[];
  printingCount: number;
  onAddDevice: () => void;
  onScanPhoto: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const anchorRef = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 32, height: 32 });
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
    <View style={{ paddingTop: topInset, zIndex: 20 }} className="bg-card">
      <View className="flex-row items-center gap-3 px-5 py-3 pr-[8%]">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className={`h-2.5 w-2.5 rounded-full ${printingCount > 0 ? 'bg-brand' : onlineCount > 0 ? 'bg-deep' : 'bg-[#C5C3D1]'}`} />
          <View className="min-w-0 flex-1">
            <Text className="text-[20px] font-bold leading-7 text-ink" numberOfLines={1}>
              设备总览
            </Text>
            <Text className="text-[13px] leading-5 text-muted" numberOfLines={1}>
              {linkSummary}
            </Text>
          </View>
        </View>

        <View ref={anchorRef} collapsable={false}>
          <Pressable accessibilityLabel="更多" onPress={openMenu} className="h-8 w-8">
            <AddDeviceIcon />
          </Pressable>
        </View>
      </View>
      <HeaderMenu
        visible={menuOpen}
        top={anchor.y + anchor.height + 12}
        right={Math.max(16, windowWidth - anchor.x - anchor.width - 12)}
        onClose={() => setMenuOpen(false)}
        onAddDevice={() => runAfterClose(onAddDevice)}
        onScanPhoto={() => runAfterClose(onScanPhoto)}
      />
    </View>
  );

  function openMenu() {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  }

  function runAfterClose(action: () => void) {
    setMenuOpen(false);
    setTimeout(action, 80);
  }
}

function HeaderMenu({
  visible,
  top,
  right,
  onClose,
  onAddDevice,
  onScanPhoto,
}: {
  visible: boolean;
  top: number;
  right: number;
  onClose: () => void;
  onAddDevice: () => void;
  onScanPhoto: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1">
        <Pressable accessibilityLabel="关闭菜单" className="absolute inset-0" onPress={onClose} />
        <View style={{ position: 'absolute', top, right }} className="w-40">
          <View className="overflow-hidden rounded-md bg-[#3A3A3A]">
            <MenuRow icon={<Plus color="#FFFFFF" size={18} />} label="添加设备" onPress={onAddDevice} />
            <MenuRow icon={<Camera color="#FFFFFF" size={18} />} label="扫描拍照" onPress={onScanPhoto} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} className="flex-row items-center gap-3 px-3.5 py-3">
      {icon}
      <Text className="text-[16px] text-white">{label}</Text>
    </Pressable>
  );
}
