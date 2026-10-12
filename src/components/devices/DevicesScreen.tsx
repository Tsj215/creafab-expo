import { router } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  LayoutGrid,
  ListFilter,
  Search
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AppHeader } from '@/src/components/AppHeader';
import { DeleteDeviceConfirm, DeviceActionMenu } from '@/src/components/devices/DeviceActionMenu';
import { CompactGrid, DetailedList } from '@/src/components/devices/DeviceCards';
import { rackLetter, STATUS_RANK } from '@/src/components/devices/helpers';
import { DetailSheet, QuickSheet } from '@/src/components/devices/Sheets';
import { applyPinnedDeviceOrder, pinDeviceId, unpinDeviceId } from '@/src/runtime/device-order';
import { loadPinnedIds, savePinnedIds } from '@/src/runtime/pins';
import { connectDevice, ensureRuntime, removeDevice } from '@/src/runtime/runtime';
import { useRuntime } from '@/src/runtime/use-runtime';
import { PrinterCard, SortOrder, StatusFilter, ViewMode } from '@/src/types/printer';

const SORT_LABEL: Record<SortOrder, string> = {
  default: '默认编号',
  'progress-desc': '进度倒序',
  status: '状态优先',
  model: '按型号',
};

const PAGE_SIZE: Record<ViewMode, number> = {
  compact: 18,
  detailed: 12,
};

export function DevicesScreen() {
  const { ready, loadError, printers } = useRuntime();
  const [activeId, setActiveId] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedRack, setSelectedRack] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('default');
  const [currentPage, setCurrentPage] = useState(1);
  const [allOnOnePage, setAllOnOnePage] = useState(false);
  const [quick, setQuick] = useState<PrinterCard | null>(null);
  const [detail, setDetail] = useState<PrinterCard | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinsReady = useRef(false);

  useEffect(() => {
    if (printers.some((printer) => printer.id === activeId)) return;
    setActiveId(printers[0]?.id ?? '');
  }, [activeId, printers]);

  useEffect(() => {
    let active = true;
    void loadPinnedIds().then((ids) => {
      if (!active || pinsReady.current) return;
      pinsReady.current = true;
      setPinnedIds(ids);
    });
    return () => {
      active = false;
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const rememberPins = (ids: string[]) => {
    pinsReady.current = true;
    setPinnedIds(ids);
    void savePinnedIds(ids);
  };

  const deletePrinter = (id: string) => {
    const current = printers.find((printer) => printer.id === id);
    setDeleteId(null);
    setDetail((open) => (open?.id === id ? null : open));
    setActionId((open) => (open === id ? null : open));
    rememberPins(unpinDeviceId(pinnedIds, id));
    void removeDevice(id)
      .then(() => showToast(current ? `已删除 ${current.name}` : '已删除设备'))
      .catch(() => showToast('删除失败'));
  };

  const printingCount = printers.filter((printer) => printer.status === 'printing').length;
  const heatingCount = printers.filter((printer) => printer.status === 'heating').length;
  const standbyCount = printers.filter(
    (printer) => printer.status === 'standby' || printer.status === 'completed',
  ).length;

  const racks = useMemo(() => {
    const found = new Set<string>();
    printers.forEach((printer) => {
      const rack = rackLetter(printer.name);
      if (rack) found.add(rack);
    });
    return Array.from(found);
  }, [printers]);

  const filtered = useMemo(() => {
    let result = printers.filter((printer) => {
      if (statusFilter === 'printing' && printer.status !== 'printing') return false;
      if (statusFilter === 'heating' && printer.status !== 'heating') return false;
      if (statusFilter === 'standby' && printer.status !== 'standby' && printer.status !== 'completed') return false;
      if (selectedRack !== 'all' && rackLetter(printer.name) !== selectedRack) return false;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        printer.name.toLowerCase().includes(query) ||
        printer.model.toLowerCase().includes(query) ||
        printer.modelCode.toLowerCase().includes(query) ||
        printer.ipAddress.includes(query) ||
        (printer.job?.fileName.toLowerCase().includes(query) ?? false)
      );
    });

    if (sortOrder === 'progress-desc') {
      result = [...result].sort(
        (a, b) => (b.job?.progressPercent ?? 0) - (a.job?.progressPercent ?? 0),
      );
    } else if (sortOrder === 'status') {
      result = [...result].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    } else if (sortOrder === 'model') {
      result = [...result].sort((a, b) => a.model.localeCompare(b.model));
    }
    return applyPinnedDeviceOrder(result, pinnedIds);
  }, [pinnedIds, printers, searchQuery, selectedRack, sortOrder, statusFilter]);

  const pageSize = allOnOnePage ? filtered.length || 1 : PAGE_SIZE[viewMode];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const remember = (printer: PrinterCard) => setActiveId(printer.id);

  const openMonitor = (printer: PrinterCard) => {
    remember(printer);
    setQuick(null);
    router.push('/monitor');
  };

  const openControl = (printer: PrinterCard) => {
    remember(printer);
    setQuick(null);
    router.push('/control');
  };

  const openDetail = (printer: PrinterCard) => {
    setQuick(null);
    setDetail(printer);
  };

  const cardProps = {
    printers: pageItems,
    activeId,
    onOpenQuick: setQuick,
    onSelect: (printer) => setActiveId(printer.id),
    onMonitor: openMonitor,
    onControl: openControl,
    onDetail: openDetail,
    onPause: () => showToast('暂不支持该操作'),
    onResume: () => showToast('暂不支持该操作'),
    onLongPress: (printer: PrinterCard) => setActionId(printer.id),
    pinnedIds,
  };
  const detailPrinter = detail ? (printers.find((printer) => printer.id === detail.id) ?? null) : null;
  const actionPrinter = actionId ? (printers.find((printer) => printer.id === actionId) ?? null) : null;
  const deleteTarget = deleteId ? (printers.find((printer) => printer.id === deleteId) ?? null) : null;
  const noDevices = ready && printers.length === 0;
  const listEmpty = pageItems.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppHeader
        printers={printers}
        printingCount={printingCount}
        onAddDevice={() => router.push('/add-device')}
        onScanPhoto={() => router.push('/ocr')}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="grow-0 gap-3 px-3.5 pt-3 pb-8"
        keyboardShouldPersistTaps="handled">
          <View className="flex-row gap-1.5">
            <StatPill label="全部设备" value={printers.length} active={statusFilter === 'all'} onPress={() => { setStatusFilter('all'); setCurrentPage(1); }} />
            <StatPill label="打印中" value={printingCount} active={statusFilter === 'printing'} tone="emerald" onPress={() => { setStatusFilter('printing'); setCurrentPage(1); }} />
            <StatPill label="预热中" value={heatingCount} active={statusFilter === 'heating'} tone="sky" onPress={() => { setStatusFilter('heating'); setCurrentPage(1); }} />
            <StatPill label="待机就绪" value={standbyCount} active={statusFilter === 'standby'} onPress={() => { setStatusFilter('standby'); setCurrentPage(1); }} />
          </View>

        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1 flex-row items-center rounded-xl border border-line bg-card px-2.5">
            <Search color="#4A4863" size={14} />
            <TextInput
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                setCurrentPage(1);
              }}
              placeholder="搜索机号/机型/IP..."
              placeholderTextColor="#9A98AB"
              className="ml-2 h-9 flex-1 text-sm text-ink"
            />
          </View>
          <View className="flex-row rounded-xl border border-line bg-card p-1">
            <ModeButton label="详细" active={viewMode === 'detailed'} onPress={() => { setViewMode('detailed'); setCurrentPage(1); }}>
              <LayoutGrid color={viewMode === 'detailed' ? '#101010' : '#4A4863'} size={14} />
            </ModeButton>
            <ModeButton label="紧凑" active={viewMode === 'compact'} onPress={() => { setViewMode('compact'); setCurrentPage(1); }}>
              <Grid2x2 color={viewMode === 'compact' ? '#101010' : '#4A4863'} size={14} />
            </ModeButton>
          </View>
        </View>

        {racks.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-1.5">
            <ListFilter color="#4A4863" size={12} />
            <Text className="text-xs text-muted">机架分区</Text>
            <RackChip
              label={`全部 (${printers.length})`}
              active={selectedRack === 'all'}
              onPress={() => {
                setSelectedRack('all');
                setCurrentPage(1);
              }}
            />
            {racks.map((rack) => {
              const count = printers.filter((printer) => rackLetter(printer.name) === rack).length;
              return (
                <RackChip
                  key={rack}
                  label={`${rack}区 (${count})`}
                  active={selectedRack === rack}
                  onPress={() => {
                    setSelectedRack(rack);
                    setCurrentPage(1);
                  }}
                />
              );
            })}
          </ScrollView>
        ) : null}

        {!ready ? (
          <View className="items-center rounded-2xl border border-line bg-card px-4 py-8">
            <Text className="text-base font-medium text-ink">正在读取设备档案</Text>
          </View>
        ) : listEmpty ? (
          <View className="items-center rounded-2xl border border-line bg-card px-4 py-8">
            <Text className="text-base font-medium text-ink">
              {loadError ? '设备档案读取失败' : noDevices ? '还没有设备' : '没有匹配的设备'}
            </Text>
            <Text className="mt-1 text-center text-sm text-muted">
              {loadError ?? (noDevices ? '先选择品牌，再扫描局域网或填写地址' : '换一个筛选或搜索词')}
            </Text>
            {loadError ? (
              <Pressable onPress={() => void ensureRuntime()} className="mt-3 rounded-xl bg-brand px-3 py-2">
                <Text className="text-sm font-semibold text-ink">重试</Text>
              </Pressable>
            ) : null}
            {noDevices && !loadError ? (
              <Pressable onPress={() => router.push('/add-device')} className="mt-3 rounded-md bg-brand px-3 py-2">
                <Text className="text-sm font-semibold text-ink">添加设备</Text>
              </Pressable>
            ) : null}
          </View>
        ) : viewMode === 'compact' ? (
          <CompactGrid {...cardProps} />
        ) : (
          <DetailedList {...cardProps} />
        )}

        {filtered.length > 16 ? (
          <View className="flex-row items-center justify-between rounded-xl border border-line bg-card px-3 py-2.5">
            <View className="min-w-0 flex-1">
              <Text className="text-xs text-muted">
                {allOnOnePage
                  ? `全屏平铺显示全部 ${filtered.length} 台设备`
                  : `第 ${safePage} / ${totalPages} 页 · 共 ${filtered.length} 台`}
              </Text>
              <Pressable onPress={() => { setAllOnOnePage((value) => !value); setCurrentPage(1); }}>
                <Text className="mt-1 text-sm font-medium text-deep">
                  {allOnOnePage ? '切换分页模式' : '平铺全部设备'}
                </Text>
              </Pressable>
            </View>
            {allOnOnePage || totalPages <= 1 ? null : (
              <View className="flex-row items-center gap-1">
                <Pressable
                  disabled={safePage <= 1}
                  onPress={() => setCurrentPage(Math.max(1, safePage - 1))}
                  className="rounded-lg bg-soft p-1.5">
                  <ChevronLeft color={safePage <= 1 ? '#C5C3D1' : '#4A4863'} size={14} />
                </Pressable>
                <Text className="px-1 font-mono-bold text-sm text-deep">{safePage}</Text>
                <Pressable
                  disabled={safePage >= totalPages}
                  onPress={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                  className="rounded-lg bg-soft p-1.5">
                  <ChevronRight color={safePage >= totalPages ? '#C5C3D1' : '#4A4863'} size={14} />
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {toast ? (
        <View className="absolute left-4 right-4 top-3 z-50 rounded-2xl bg-deep px-4 py-2.5">
          <Text className="text-center text-sm font-semibold text-white">{toast}</Text>
        </View>
      ) : null}

      <QuickSheet
        printer={quick}
        onClose={() => setQuick(null)}
        onPause={() => {
          setQuick(null);
          showToast('暂不支持该操作');
        }}
        onResume={() => {
          setQuick(null);
          showToast('暂不支持该操作');
        }}
        onMonitor={openMonitor}
        onControl={openControl}
        onDetail={openDetail}
      />
      <DetailSheet
        printer={detailPrinter}
        onClose={() => setDetail(null)}
        onToast={showToast}
        onConnect={(id) => {
          void connectDevice(id);
          showToast('正在连接');
        }}
        onRemove={(id) => deletePrinter(id)}
      />
      <DeviceActionMenu
        printer={actionPrinter}
        pinned={actionPrinter ? pinnedIds.includes(actionPrinter.id) : false}
        onClose={() => setActionId(null)}
        onTogglePin={(printer) => {
          const pinned = pinnedIds.includes(printer.id);
          rememberPins(pinned ? unpinDeviceId(pinnedIds, printer.id) : pinDeviceId(pinnedIds, printer.id));
          setActionId(null);
          showToast(pinned ? '已取消置顶，设备已回到原来的位置' : '已置顶设备');
        }}
        onAskDelete={(printer) => {
          setActionId(null);
          setDeleteId(printer.id);
        }}
      />
      <DeleteDeviceConfirm
        printer={deleteTarget}
        onClose={() => setDeleteId(null)}
        onConfirm={(printer) => deletePrinter(printer.id)}
      />
    </View>
  );
}

function StatPill({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: number;
  active: boolean;
  onPress: () => void;
}) {
  const activeClass = 'bg-[#34E0A1]';
  const valueClass = 'text-brand color-[#101010]';
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-xl px-1 py-2 ${active ? activeClass : 'bg-[#F7F7F7]'}`}>
      <Text className="text-md text-muted color-[#101010]">{label}</Text>
      <Text className={`mt-0.5 font-mono-bold text-base ${active ? valueClass : 'text-ink'}`}>{value}</Text>
    </Pressable>
  );
}

function ModeButton({
  label,
  active,
  onPress,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      className={`rounded-lg p-1.5 ${active ? 'bg-brand' : ''}`}>
      {children}
    </Pressable>
  );
}

function RackChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg px-2 py-1 ${active ? 'bg-brand' : 'border border-line bg-card'}`}>
      <Text className={`text-sm font-medium ${active ? 'text-ink' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}
