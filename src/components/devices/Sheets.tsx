import { Cpu, Info, Pause, Play, SlidersHorizontal, Tv, Wifi, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { formatRemain, statusLabel } from '@/src/components/devices/helpers';
import { crealityModelImage, ModelThumb } from '@/src/components/devices/model-thumb';
import { PrinterCard } from '@/src/types/printer';

export function QuickSheet({
  printer,
  onClose,
  onPause,
  onResume,
  onMonitor,
  onControl,
  onDetail,
}: {
  printer: PrinterCard | null;
  onClose: () => void;
  onPause: (printer: PrinterCard) => void;
  onResume: (printer: PrinterCard) => void;
  onMonitor: (printer: PrinterCard) => void;
  onControl: (printer: PrinterCard) => void;
  onDetail: (printer: PrinterCard) => void;
}) {
  return (
    <Modal visible={!!printer} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/80">
        <Pressable className="flex-1" onPress={onClose} />
        {printer ? (
          <View className="gap-3 rounded-t-3xl border border-line bg-card p-4 pb-8">
            <View className="flex-row items-start justify-between">
              <ModelThumb model={printer.modelCode} size={40} />
              <View className="min-w-0 flex-1 pr-3">
                <Text className="text-base font-medium text-ink" numberOfLines={1}>
                  {printer.name}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  <Text className="font-mono text-brand">{printer.ipAddress}</Text>
                  {' · '}
                  {printer.model}
                </Text>
              </View>
              <Pressable onPress={onClose} className="rounded-full p-1.5">
                <X color="#4A4863" size={16} />
              </Pressable>
            </View>
            <View className="gap-2 rounded-2xl border border-line bg-soft p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted">设备运行状态</Text>
                <Text className="text-base font-medium text-ink">{statusLabel(printer.status)}</Text>
              </View>
              {printer.job ? (
                <View className="gap-1 border-t border-line pt-2">
                  <Text className="text-base font-medium text-ink" numberOfLines={1}>
                    {printer.job.fileName}
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-muted">进度 {printer.job.progressPercent}%</Text>
                    <Text className="text-xs text-muted">剩余 {formatRemain(printer.job.timeRemainingSec)}</Text>
                  </View>
                </View>
              ) : null}
              <View className="flex-row gap-2 border-t border-line pt-2">
                <Text className="flex-1 text-xs text-muted">
                  喷嘴 <Text className="font-mono-bold text-warn">{printer.nozzle.current}°C</Text>
                </Text>
                <Text className="flex-1 text-xs text-muted">
                  热床 <Text className="font-mono-bold text-deep">{printer.bed.current}°C</Text>
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              {printer.status === 'printing' ? (
                <Pressable
                  onPress={() => onPause(printer)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5">
                  <Pause color="#101010" size={14} fill="#101010" />
                  <Text className="text-sm font-semibold text-ink">暂停此机器</Text>
                </Pressable>
              ) : printer.status === 'paused' ? (
                <Pressable
                  onPress={() => onResume(printer)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5">
                  <Play color="#101010" size={14} fill="#101010" />
                  <Text className="text-sm font-semibold text-ink">恢复继续打印</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => onControl(printer)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-soft py-2.5">
                  <SlidersHorizontal color="#26225F" size={14} />
                  <Text className="text-sm font-semibold text-ink">轴温控制</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => onMonitor(printer)}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5">
                <Tv color="#101010" size={14} />
                <Text className="text-sm font-semibold text-ink">进入实时监控</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => onDetail(printer)}
              className="flex-row items-center justify-center gap-1.5 rounded-xl bg-soft py-2">
              <Info color="#4A4863" size={14} />
              <Text className="text-xs text-muted">查看该设备网络与固件详情</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function DetailSheet({
  printer,
  onClose,
  onRemove,
  onConnect,
  onToast,
}: {
  printer: PrinterCard | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  onConnect: (id: string) => void;
  onToast: (message: string) => void;
}) {
  return (
    <Modal visible={!!printer} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/80 px-3">
        <Pressable className="absolute inset-0" onPress={onClose} />
        {printer ? (
          <View className="max-h-[86%] w-full overflow-hidden rounded-3xl border border-line bg-card">
            <View className="flex-row items-center justify-between border-b border-line bg-soft px-4 py-4">
              <View className="min-w-0 flex-1 flex-row items-center gap-2.5 pr-2">
                <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-deep/20 bg-soft">
                  {crealityModelImage(printer.modelCode) ? (
                    <ModelThumb model={printer.modelCode} size={40} />
                  ) : (
                    <Cpu color="#26225F" size={18} />
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-xl font-medium text-ink" numberOfLines={1}>
                    {printer.name}
                  </Text>
                  <Text className="text-xs text-muted" numberOfLines={1}>
                    {printer.model ? `${printer.model} · ` : ''}
                    {printer.driver === 'bambu' ? '拓竹局域网' : '创想三维局域网直连'}
                  </Text>
                </View>
              </View>
              <Pressable onPress={onClose} className="rounded-full p-2">
                <X color="#4A4863" size={18} />
              </Pressable>
            </View>
            <ScrollView className="px-4 py-4" contentContainerClassName="gap-3 pb-6">
              <View className="gap-2 rounded-2xl border border-line bg-soft p-3.5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Wifi color="#2AB381" size={16} />
                    <Text className="text-xl font-medium text-ink">局域网网络详情</Text>
                  </View>
                  <Text className="rounded-full border border-line bg-soft px-2 py-0.5 text-2xs text-muted">
                    {statusLabel(printer.status)}
                  </Text>
                </View>
                <InfoLine label="局域网 IPv4 地址" value={printer.ipAddress} />
                <InfoLine label={printer.driver === 'bambu' ? 'MQTT 端口' : 'HTTP 端口'} value={String(printer.port)} />
                <InfoLine label="网卡物理 MAC 地址" value={printer.macAddress || '—'} />
                <InfoLine label="识别方式" value={printer.driver === 'bambu' ? '拓竹序列号 / 访问码' : '创想 /info'} />
              </View>
              <View className="gap-2 rounded-2xl border border-line bg-soft p-3.5">
                <Text className="text-xl font-medium text-ink">主板与固件系统</Text>
                <InfoLine label="固件版本" value={printer.firmwareVersion || '—'} />
                <InfoLine label="型号" value={printer.model || '—'} />
                <InfoLine label="运行状态" value={statusLabel(printer.status)} />
                {printer.connectionNote ? <InfoLine label="连接说明" value={printer.connectionNote} /> : null}
              </View>
              {printer.status === 'offline' || printer.status === 'connecting' ? (
                <Pressable
                  disabled={printer.status === 'connecting'}
                  onPress={() => onConnect(printer.id)}
                  className="items-center rounded-xl bg-brand py-2.5">
                  <Text className="text-sm font-semibold text-ink">
                    {printer.status === 'connecting' ? '正在连接' : '重新连接'}
                  </Text>
                </Pressable>
              ) : null}
              {printer.driver === 'creality' ? (
                <>
                  <Pressable
                    onPress={() => onToast('暂不支持该操作')}
                    className="items-center rounded-md bg-soft py-2.5">
                    <Text className="text-sm font-semibold text-ink">重载 Klipper 固件</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onToast('暂不支持该操作')}
                    className="items-center rounded-md bg-soft py-2.5">
                    <Text className="text-sm font-semibold text-ink">远程重启设备系统</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable
                onPress={() => onRemove(printer.id)}
                className="items-center rounded-xl border border-danger/30 bg-danger/10 py-2.5">
                <Text className="text-sm font-semibold text-danger">从当前列表移除该打印机</Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-2xs text-muted">{label}</Text>
      <Text className="font-mono text-sm text-ink">{value}</Text>
    </View>
  );
}
