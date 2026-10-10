import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  FileCode2,
  Flame,
  Info,
  Layers,
  Pause,
  Pin,
  Play,
  SlidersHorizontal,
  Sparkles,
  Tv,
  Wifi,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { formatRemain, idleCaption, liveReading, machineCode, STATUS_COLOR, statusLabel } from '@/src/components/devices/helpers';
import { crealityModelImage, ModelThumb } from '@/src/components/devices/model-thumb';
import { PrinterCard } from '@/src/types/printer';

function ModelOrIcon({ model, size, icon }: { model: string; size: number; icon: ReactNode }) {
  return crealityModelImage(model) ? <ModelThumb model={model} size={size} /> : icon;
}

export function ProgressBar({
  progress,
  paused,
  height = 8,
}: {
  progress: number;
  paused?: boolean;
  height?: number;
}) {
  return (
    <View className="overflow-hidden rounded-full bg-soft" style={{ height }}>
      <LinearGradient
        colors={paused ? ['#E8A317', '#B86E00'] : ['#26225F', '#2AB381']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${Math.max(6, Math.min(100, progress))}%`, height: '100%' }}
      />
    </View>
  );
}

function PinMark() {
  return <Pin color="#26225F" size={10} fill="#26225F" />;
}

function StatusDot({ status, size = 8 }: { status: PrinterCard['status']; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: STATUS_COLOR[status],
      }}
    />
  );
}

type GridProps = {
  printers: PrinterCard[];
  activeId: string;
  onOpenQuick: (printer: PrinterCard) => void;
  onSelect: (printer: PrinterCard) => void;
  onMonitor: (printer: PrinterCard) => void;
  onControl: (printer: PrinterCard) => void;
  onDetail: (printer: PrinterCard) => void;
  onPause: (printer: PrinterCard) => void;
  onResume: (printer: PrinterCard) => void;
  onLongPress: (printer: PrinterCard) => void;
  pinnedIds: readonly string[];
};

function Wrap({ children }: { children: ReactNode }) {
  return <View className="-m-1 flex-row flex-wrap">{children}</View>;
}

function Cell({ cols, children }: { cols: number; children: ReactNode }) {
  return <View style={{ width: `${100 / cols}%`, padding: 4 }}>{children}</View>;
}

export function NanoGrid({ printers, onSelect, onLongPress, pinnedIds }: GridProps) {
  return (
    <Wrap>
      {printers.map((printer) => {
        const progress = printer.job?.progressPercent ?? 0;
        const printing = printer.status === 'printing';
        const paused = printer.status === 'paused';
        const heating = printer.status === 'heating';
        const completed = printer.status === 'completed';
        return (
          <Cell key={printer.id} cols={4}>
            <Pressable
              delayLongPress={400}
              onLongPress={() => onLongPress(printer)}
              onPress={() => onSelect(printer)}
              className={`aspect-square justify-between rounded-xl border p-1.5 ${
                printing
                  ? 'border-brand/40 bg-card'
                  : paused
                    ? 'border-warn/40 bg-card'
                    : heating
                      ? 'border-deep/30 bg-card'
                      : completed
                        ? 'border-brand/40 bg-card'
                        : 'border-line bg-soft'
              }`}>
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-[11px] font-semibold text-ink" numberOfLines={1}>
                  {machineCode(printer.name, printer.ipAddress)}
                </Text>
                <View className="flex-row items-center gap-1">
                  {pinnedIds.includes(printer.id) ? <PinMark /> : null}
                  <StatusDot status={printer.status} />
                </View>
              </View>
              <View className="items-center">
                {printing ? (
                  <>
                    <Text className="font-mono text-sm font-black text-brand">{progress}%</Text>
                    <Text className="font-mono text-[11px] text-muted">
                      {printer.job ? formatRemain(printer.job.timeRemainingSec) : ''}
                    </Text>
                  </>
                ) : paused ? (
                  <>
                    <Text className="font-mono text-sm font-semibold text-warn">{progress}%</Text>
                    <Text className="text-[11px] text-warn">已暂停</Text>
                  </>
                ) : heating ? (
                  <>
                    <Sparkles color="#26225F" size={14} />
                    <Text className="text-[11px] font-bold text-deep">预热中</Text>
                  </>
                ) : completed ? (
                  <>
                    <CheckCircle2 color="#2AB381" size={14} />
                    <Text className="text-[11px] font-bold text-brand">已完成</Text>
                  </>
                ) : printer.status === 'connecting' ? (
                  <>
                    <ModelOrIcon model={printer.modelCode} size={22} icon={<Sparkles color="#26225F" size={14} />} />
                    <Text className="text-[11px] font-bold text-deep">连接中</Text>
                  </>
                ) : printer.status === 'offline' ? (
                  <>
                    <ModelOrIcon model={printer.modelCode} size={22} icon={<Box color="#4A4863" size={12} />} />
                    <Text className="text-[11px] text-muted">未连接</Text>
                  </>
                ) : (
                  <>
                    <ModelOrIcon model={printer.modelCode} size={22} icon={<Box color="#4A4863" size={12} />} />
                    <Text className="text-[11px] text-muted">待机</Text>
                  </>
                )}
              </View>
              {printing || paused ? (
                <ProgressBar progress={progress} paused={paused} height={4} />
              ) : (
                <View className="flex-row items-center justify-between border-t border-line pt-0.5">
                  <Text className="font-mono text-[11px] text-warn">
                    {liveReading(printer.status, `${printer.nozzle.current.toFixed(0)}°`)}
                  </Text>
                  <Text className="font-mono text-[11px] text-deep">
                    {liveReading(printer.status, `${printer.bed.current.toFixed(0)}°`)}
                  </Text>
                </View>
              )}
            </Pressable>
          </Cell>
        );
      })}
    </Wrap>
  );
}

export function MicroGrid({ printers, onSelect, onLongPress, pinnedIds }: GridProps) {
  return (
    <Wrap>
      {printers.map((printer) => {
        const progress = printer.job?.progressPercent ?? 0;
        const printing = printer.status === 'printing';
        const paused = printer.status === 'paused';
        const heating = printer.status === 'heating';
        return (
          <Cell key={printer.id} cols={3}>
            <Pressable
              delayLongPress={400}
              onLongPress={() => onLongPress(printer)}
              onPress={() => onSelect(printer)}
              className={`rounded-xl border p-2 ${
                printing
                  ? 'border-brand/30 bg-card'
                  : paused
                    ? 'border-warn/30 bg-card'
                    : heating
                      ? 'border-deep/25 bg-card'
                      : 'border-line bg-soft'
              }`}>
              <View className="flex-row items-center justify-between gap-1">
                <View className="min-w-0 flex-1 flex-row items-center gap-1">
                  <StatusDot status={printer.status} />
                  {pinnedIds.includes(printer.id) ? <PinMark /> : null}
                  <Text className="flex-1 text-base font-medium text-ink" numberOfLines={1}>
                    {printer.name.split(' ')[0]}
                  </Text>
                </View>
                <Text className="font-mono text-[11px] text-muted">.{printer.ipAddress.split('.').pop()}</Text>
              </View>
              <View className="py-1.5">
                {printing || paused ? (
                  <>
                    <View className="mb-1 flex-row items-end justify-between">
                      <Text className="font-mono text-base font-semibold text-ink">{progress}%</Text>
                      <Text className="text-[11px] text-muted">
                        {printer.job ? formatRemain(printer.job.timeRemainingSec) : ''}
                      </Text>
                    </View>
                    <ProgressBar progress={progress} paused={paused} height={6} />
                  </>
                ) : heating ? (
                  <View className="flex-row items-center gap-1 py-1">
                    <Sparkles color="#26225F" size={12} />
                    <Text className="text-xs text-deep">预热中...</Text>
                  </View>
                ) : (
                  <View className="flex-row items-center gap-1 py-1">
                    <CheckCircle2 color={printer.status === 'offline' ? '#4A4863' : printer.status === 'connecting' ? '#26225F' : '#2AB381'} size={12} />
                    <Text className="text-xs text-muted">
                      {idleCaption(printer.status, printer.connectionNote)}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center justify-between border-t border-line pt-1">
                <Text className="font-mono text-[11px] text-warn">
                  {liveReading(printer.status, `${printer.nozzle.current.toFixed(0)}°`)}
                </Text>
                <Text className="font-mono text-[11px] text-deep">
                  {liveReading(printer.status, `${printer.bed.current.toFixed(0)}°`)}
                </Text>
                <Text className="max-w-[48px] text-[11px] text-muted" numberOfLines={1}>
                  {printer.model}
                </Text>
              </View>
            </Pressable>
          </Cell>
        );
      })}
    </Wrap>
  );
}

function JobPauseButton({
  printer,
  onPause,
  onResume,
  compact,
}: {
  printer: PrinterCard;
  onPause: (printer: PrinterCard) => void;
  onResume: (printer: PrinterCard) => void;
  compact?: boolean;
}) {
  if (printer.status === 'printing') {
    return (
      <Pressable
        onPress={() => onPause(printer)}
        className="flex-row items-center justify-center gap-1 rounded-lg border border-warn/30 bg-warn/10 px-2 py-1">
        <Pause color="#B86E00" size={12} fill="#B86E00" />
        <Text className="text-sm font-semibold text-warn">暂停</Text>
      </Pressable>
    );
  }
  if (printer.status === 'paused') {
    return (
      <Pressable
        onPress={() => onResume(printer)}
        className="flex-row items-center justify-center gap-1 rounded-lg bg-brand px-2 py-1">
        <Play color="#101010" size={12} fill="#101010" />
        <Text className="text-sm font-semibold text-ink">{compact ? '继续' : '继续'}</Text>
      </Pressable>
    );
  }
  return null;
}

export function CompactGrid(props: GridProps) {
  const { printers, onSelect, onMonitor, onDetail, onPause, onResume, onLongPress, pinnedIds } = props;
  return (
    <Wrap>
      {printers.map((printer) => {
        const printing = printer.status === 'printing';
        const paused = printer.status === 'paused';
        const heating = printer.status === 'heating';
        const job = printer.job;
        const badge = printing ? '打印中' : paused ? '已暂停' : heating ? '加热中' : printer.status === 'connecting' ? '连接中' : printer.status === 'offline' ? '未连接' : '就绪';
        return (
          <Cell key={printer.id} cols={2}>
            <Pressable
              delayLongPress={400}
              onLongPress={() => onLongPress(printer)}
              onPress={() => onSelect(printer)}
              className="h-full gap-2 rounded-2xl border border-line bg-card p-3">
              <View className="flex-row items-start justify-between gap-1">
                <ModelThumb model={printer.modelCode} size={36} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <StatusDot status={printer.status} />
                    {pinnedIds.includes(printer.id) ? <PinMark /> : null}
                    <Text className="flex-1 text-base font-medium text-ink" numberOfLines={1}>
                      {printer.name}
                    </Text>
                  </View>
                  <Text className="mt-0.5 font-mono text-xs text-muted" numberOfLines={1}>
                    {printer.ipAddress} · {printer.model}
                  </Text>
                </View>
                <Text
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    printing
                      ? 'bg-brand/15 text-brand'
                      : paused
                        ? 'bg-warn/10 text-warn'
                        : heating
                          ? 'bg-deep/10 text-deep'
                          : 'bg-soft text-muted'
                  }`}>
                  {badge}
                </Text>
              </View>
              <View className="min-h-[72px] justify-center gap-1.5">
                {job ? (
                  <>
                    <View className="flex-row items-end justify-between">
                      <Text className="font-mono text-base font-semibold text-ink">{job.progressPercent}%</Text>
                      <Text className="text-xs text-muted">余 {formatRemain(job.timeRemainingSec)}</Text>
                    </View>
                    <ProgressBar progress={job.progressPercent} paused={paused} />
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {job.fileName}
                    </Text>
                  </>
                ) : (
                  <View className="flex-row items-center gap-1.5">
                    <CheckCircle2 color={printer.status === 'offline' ? '#4A4863' : printer.status === 'connecting' ? '#26225F' : '#2AB381'} size={14} />
                    <Text className="text-xs text-muted">
                      {idleCaption(printer.status, printer.connectionNote)}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center justify-between border-t border-line pt-1">
                <View className="flex-row items-center gap-1">
                  <Flame color="#B86E00" size={12} />
                  <Text className="font-mono text-xs text-muted">
                    {liveReading(printer.status, `${printer.nozzle.current.toFixed(0)}°`)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Layers color="#26225F" size={12} />
                  <Text className="font-mono text-xs text-muted">
                    {liveReading(printer.status, `${printer.bed.current.toFixed(0)}°`)}
                  </Text>
                </View>
                <Text className="font-mono text-[11px] text-brand">
                  {liveReading(printer.status, `${printer.pingLatencyMs}ms`)}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <JobPauseButton printer={printer} onPause={onPause} onResume={onResume} compact />
                <Pressable
                  onPress={() => onMonitor(printer)}
                  className="flex-1 flex-row items-center justify-center gap-1 rounded-lg bg-brand py-1">
                  <Tv color="#101010" size={12} />
                  <Text className="text-sm font-semibold text-ink">监控</Text>
                </Pressable>
                <Pressable onPress={() => onDetail(printer)} className="rounded-lg bg-soft p-1.5">
                  <Info color="#4A4863" size={12} />
                </Pressable>
              </View>
            </Pressable>
          </Cell>
        );
      })}
    </Wrap>
  );
}

export function DetailedList(props: GridProps) {
  const { printers, onSelect, onMonitor, onControl, onDetail, onPause, onResume, onLongPress, pinnedIds } = props;
  return (
    <View className="gap-3">
      {printers.map((printer) => {
        const job = printer.job;
        const paused = printer.status === 'paused';
        return (
          <Pressable
            key={printer.id}
            delayLongPress={400}
            onLongPress={() => onLongPress(printer)}
            onPress={() => onSelect(printer)}
            className="overflow-hidden rounded-2xl border border-line bg-card">
            <View className="flex-row items-center justify-between gap-2 border-b border-line bg-soft px-3 py-3">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <ModelThumb model={printer.modelCode} size={40} />
                <StatusDot status={printer.status} size={10} />
                {pinnedIds.includes(printer.id) ? <PinMark /> : null}
                <Text className="flex-1 text-base font-medium text-ink" numberOfLines={1}>
                  {printer.name}
                </Text>
              </View>
            </View>
            <View className="gap-3 p-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Wifi color="#4A4863" size={14} />
                  <Text className="font-mono text-xs text-muted">
                    {printer.ipAddress}:{printer.port}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  {printer.status === 'paused' ? <AlertTriangle color="#B86E00" size={12} /> : null}
                  {printer.status === 'heating' ? <Sparkles color="#26225F" size={12} /> : null}
                  <Text className="text-sm font-medium text-muted">{statusLabel(printer.status)}</Text>
                  <Text className="font-mono text-[11px] text-brand">
                    {liveReading(printer.status, `${printer.pingLatencyMs}ms`)}
                  </Text>
                </View>
              </View>
              {job ? (
                <View className="gap-2 rounded-xl border border-line bg-soft p-3">
                  <View className="flex-row items-center gap-2">
                    {job.thumbnailUrl ? (
                      <Image source={{ uri: job.thumbnailUrl }} className="h-10 w-10 rounded-lg bg-soft" />
                    ) : (
                      <View className="h-10 w-10 items-center justify-center rounded-lg bg-soft">
                        <FileCode2 color="#4A4863" size={16} />
                      </View>
                    )}
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-medium text-ink" numberOfLines={1}>
                        {job.fileName}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                        {job.filamentType} · {job.speedMmS} mm/s · 层高 {job.layerHeight}mm
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-end justify-between">
                    <Text className="font-mono text-base font-semibold text-ink">
                      {job.progressPercent}%
                      <Text className="text-xs font-normal text-muted">
                        {' '}
                        ({job.currentLayer} / {job.totalLayers} 层)
                      </Text>
                    </Text>
                    <View className="flex-row items-center gap-1">
                      <Clock color="#4A4863" size={12} />
                      <Text className="text-xs text-muted">剩余 {formatRemain(job.timeRemainingSec)}</Text>
                    </View>
                  </View>
                  <ProgressBar progress={job.progressPercent} paused={paused} />
                </View>
              ) : (
                <View className="flex-row items-center justify-between rounded-xl border border-line bg-soft px-3 py-2.5">
                  <View className="flex-1 flex-row items-center gap-2">
                    <CheckCircle2
                      color={printer.status === 'offline' ? '#4A4863' : printer.status === 'connecting' ? '#26225F' : '#2AB381'}
                      size={16}
                    />
                    <Text className="flex-1 text-xs text-muted">
                      {idleCaption(printer.status, printer.connectionNote)}
                    </Text>
                  </View>
                  <Text className="font-mono text-[11px] text-muted">
                    {printer.status === 'connecting' ? 'CONNECTING' : printer.status === 'offline' ? 'OFFLINE' : 'ONLINE'}
                  </Text>
                </View>
              )}
              <View className="flex-row gap-1.5">
                <TempCell
                  label="喷嘴"
                  value={liveReading(printer.status, `${printer.nozzle.current.toFixed(0)}/${printer.nozzle.target}°`)}
                  tone="text-warn"
                  icon={<Flame color="#B86E00" size={12} />}
                />
                <TempCell
                  label="热床"
                  value={liveReading(printer.status, `${printer.bed.current.toFixed(0)}/${printer.bed.target}°`)}
                  tone="text-deep"
                  icon={<Layers color="#26225F" size={12} />}
                />
                {printer.chamber ? (
                  <TempCell
                    label="腔体"
                    value={liveReading(printer.status, `${printer.chamber.current.toFixed(0)}°C`)}
                    tone="text-brand"
                    icon={<Box color="#2AB381" size={12} />}
                  />
                ) : (
                  <TempCell
                    label="耗材"
                    value={liveReading(printer.status, printer.filamentOk ? '正常' : '断料')}
                    tone="text-deep"
                    icon={<CheckCircle2 color="#26225F" size={12} />}
                  />
                )}
              </View>
              <View className="flex-row flex-wrap items-center gap-1.5 border-t border-line pt-2">
                <JobPauseButton printer={printer} onPause={onPause} onResume={onResume} />
                <View className="min-w-[8px] flex-1" />
                <Pressable
                  onPress={() => onControl(printer)}
                  className="flex-row items-center gap-1 rounded-xl border border-line bg-soft px-2.5 py-1.5">
                  <SlidersHorizontal color="#26225F" size={14} />
                  <Text className="text-sm text-ink">控制</Text>
                </Pressable>
                <Pressable
                  onPress={() => onMonitor(printer)}
                  className="flex-row items-center gap-1 rounded-xl bg-brand px-3 py-1.5">
                  <Tv color="#101010" size={14} />
                  <Text className="text-sm font-semibold text-ink">实时监控</Text>
                </Pressable>
                <Pressable onPress={() => onDetail(printer)} className="rounded-xl border border-line bg-soft p-1.5">
                  <Info color="#4A4863" size={14} />
                </Pressable>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function TempCell({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <View className="flex-1 items-center rounded-lg border border-line bg-soft px-1 py-1.5">
      <View className="mb-0.5 flex-row items-center gap-1">
        {icon}
        <Text className="text-[11px] text-muted">{label}</Text>
      </View>
      <Text className={`font-mono text-sm font-semibold ${tone}`} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
