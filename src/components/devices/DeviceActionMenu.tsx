import { Pin, PinOff, Trash2 } from 'lucide-react-native';
import { Modal, Pressable, Text, View } from 'react-native';

import { PrinterCard } from '@/src/types/printer';

export function DeviceActionMenu({
  printer,
  pinned,
  onClose,
  onTogglePin,
  onAskDelete,
}: {
  printer: PrinterCard | null;
  pinned: boolean;
  onClose: () => void;
  onTogglePin: (printer: PrinterCard) => void;
  onAskDelete: (printer: PrinterCard) => void;
}) {
  return (
    <Modal visible={!!printer} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/70">
        <Pressable className="flex-1" onPress={onClose} />
        {printer ? (
          <View className="gap-2 rounded-t-3xl border border-line bg-card px-4 pb-8 pt-4">
            <View className="mb-1 px-1">
              <Text className="text-base font-medium text-ink" numberOfLines={1}>
                {printer.name}
              </Text>
              <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                {printer.model} · {printer.ipAddress}
              </Text>
            </View>
            <Pressable
              onPress={() => onTogglePin(printer)}
              className="flex-row items-center gap-3 rounded-md bg-soft px-3.5 py-3">
              {pinned ? <PinOff color="#4A4863" size={16} /> : <Pin color="#26225F" size={16} />}
              <Text className="text-sm font-semibold text-ink">{pinned ? '取消置顶' : '置顶设备'}</Text>
            </Pressable>
            <Pressable
              onPress={() => onAskDelete(printer)}
              className="flex-row items-center gap-3 rounded-md border border-danger/30 bg-danger/10 px-3.5 py-3">
              <Trash2 color="#C4454A" size={16} />
              <Text className="text-sm font-semibold text-danger">删除设备</Text>
            </Pressable>
            <Pressable onPress={onClose} className="items-center rounded-md py-3">
              <Text className="text-sm font-semibold text-muted">取消</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function DeleteDeviceConfirm({
  printer,
  onClose,
  onConfirm,
}: {
  printer: PrinterCard | null;
  onClose: () => void;
  onConfirm: (printer: PrinterCard) => void;
}) {
  return (
    <Modal visible={!!printer} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/80 px-6">
        <Pressable className="absolute inset-0" onPress={onClose} />
        {printer ? (
          <View className="w-full gap-4 rounded-3xl border border-line bg-card p-5">
            <View className="gap-1">
              <Text className="text-xl font-medium text-ink">删除设备</Text>
              <Text className="text-base leading-6 text-muted">
                确定从列表移除「{printer.name}」？设备档案会删除，正在使用的连接也会断开。
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable onPress={onClose} className="flex-1 items-center rounded-md bg-soft py-3">
                <Text className="text-sm font-semibold text-ink">取消</Text>
              </Pressable>
              <Pressable
                onPress={() => onConfirm(printer)}
                className="flex-1 items-center rounded-md bg-danger py-3">
                <Text className="text-sm font-semibold text-white">删除</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
