import { Check, ChevronLeft, Cpu, Info, Pause, Play, Plus, ScanLine, SlidersHorizontal, Tv, Wifi, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { extractAllText } from '@/src/ai/deepseek';

import { formatRemain, statusLabel } from '@/src/components/devices/helpers';
import { ScreenCamera } from '@/src/components/devices/ScreenCamera';
import { crealityModelImage, ModelThumb } from '@/src/components/devices/model-thumb';
import {
  BAMBU_IDENTIFY_FAILED_MESSAGE,
  buildBambuNeedAccessCodeMessage,
  canSubmitBambuManualAdd,
  isBambuLanIpv4,
  readBambuMqttPort,
  runBambuManualConnectionTest,
} from '@/src/runtime/bambu-add';
import { identifyBambuHost, testBambuLanConnection } from '@/src/runtime/bambu-lan';
import { ProbeError } from '@/src/runtime/creality-info';
import { resolveCrealityDisplayModel } from '@/src/runtime/creality-model';
import { parseBambuScreen } from '@/src/runtime/bambu-screen';
import { DEVICE_BRANDS, findDeviceBrand } from '@/src/runtime/brands';
import { parseCrealityScreen } from '@/src/runtime/creality-screen';
import { defaultScanSegments, isPrivateIpv4, ScanSegments } from '@/src/runtime/net';
import { prepareScan, probeManual, registerBambu, registerCandidate, startScan, stopScan } from '@/src/runtime/runtime';
import { useRuntime } from '@/src/runtime/use-runtime';
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
                  喷嘴 <Text className="font-mono font-bold text-warn">{printer.nozzle.current}°C</Text>
                </Text>
                <Text className="flex-1 text-xs text-muted">
                  热床 <Text className="font-mono font-bold text-deep">{printer.bed.current}°C</Text>
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
                  <Text className="rounded-full border border-line bg-soft px-2 py-0.5 text-[11px] text-muted">
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
      <Text className="text-[11px] text-muted">{label}</Text>
      <Text className="font-mono text-sm text-ink">{value}</Text>
    </View>
  );
}

const SEGMENT_KEYS = ['a', 'b', 'c', 'd'] as const;

export function ScanSheet({
  visible,
  onClose,
  onToast,
}: {
  visible: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { devices, discovery } = useRuntime();
  const [tab, setTab] = useState<'scan' | 'manual'>('scan');
  const [step, setStep] = useState<'brand' | 'form'>('brand');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [segments, setSegments] = useState<ScanSegments>({ a: '192', b: '168', c: '1', d: '' });
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [name, setName] = useState('');
  const [bambuIp, setBambuIp] = useState('');
  const [bambuAccessCode, setBambuAccessCode] = useState('');
  const [bambuSerial, setBambuSerial] = useState('');
  const [bambuHint, setBambuHint] = useState<string | null>(null);
  const [bambuMqttPort, setBambuMqttPort] = useState('8883');
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<null | 'serial' | 'scan' | 'add' | 'probe'>(null);
  const [cameraPhase, setCameraPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed');
  const sheetOpen = useRef(false);
  const [savingIp, setSavingIp] = useState<string | null>(null);
  const segmentRefs = useRef<Array<TextInput | null>>([]);
  const segmentsTouched = useRef(false);
  const scanning = discovery.status === 'running';
  const brand = findDeviceBrand(brandId ?? '');
  const isBambu = brand?.driver === 'bambu';
  const busy = task !== null;
  const canAddBambu = canSubmitBambuManualAdd({ ipAddress: bambuIp, accessCode: bambuAccessCode });

  useEffect(() => {
    if (!visible) return;
    setStep('brand');
    setBrandId(null);
    setError(null);
    setTab('scan');
    setBambuIp('');
    setBambuAccessCode('');
    setBambuSerial('');
    setBambuHint(null);
    setBambuMqttPort('8883');
    setTask(null);
    setCameraPhase('closed');
    sheetOpen.current = true;
    return () => {
      sheetOpen.current = false;
      stopScan();
    };
  }, [visible]);

  useEffect(() => {
    if (cameraPhase !== 'opening' && cameraPhase !== 'closing') return;
    const timer = setTimeout(
      () => setCameraPhase((phase) => (phase === 'opening' ? 'open' : phase === 'closing' ? 'closed' : phase)),
      Platform.OS === 'ios' ? 400 : 50,
    );
    return () => clearTimeout(timer);
  }, [cameraPhase]);

  useEffect(() => {
    if (!visible || step !== 'form' || brand?.driver !== 'creality') return;
    setError(null);
    segmentsTouched.current = false;
    let active = true;
    void prepareScan().then((result) => {
      if (!active || segmentsTouched.current) return;
      setSegments(defaultScanSegments(result.address));
    });
    return () => {
      active = false;
      stopScan();
    };
  }, [brand?.driver, step, visible]);

  const chooseBrand = (id: string) => {
    const next = findDeviceBrand(id);
    if (!next?.ready) {
      setBrandId(id);
      setError(next ? `${next.name} 的添加尚未接入` : '请选择设备品牌');
      return;
    }
    setBrandId(id);
    setError(null);
    setStep('form');
  };

  const changeSegment = (index: number, raw: string) => {
    segmentsTouched.current = true;
    if (raw.includes('.')) {
      const parts = raw
        .trim()
        .replace(/[^\d.]/g, '')
        .split('.')
        .slice(0, 4);
      setSegments((current) => {
        const next = { ...current };
        parts.forEach((part, partIndex) => {
          const key = SEGMENT_KEYS[partIndex];
          next[key] = key === 'd' ? part.slice(0, 7) : part.replace(/\D/g, '').slice(0, 3);
        });
        return next;
      });
      segmentRefs.current[Math.min(parts.length, 3)]?.focus();
      return;
    }
    const key = SEGMENT_KEYS[index];
    const text = key === 'd' ? raw.replace(/[^\d-]/g, '').slice(0, 7) : raw.replace(/\D/g, '').slice(0, 3);
    setSegments((current) => ({ ...current, [key]: text }));
    if (key !== 'd' && text.length === 3) segmentRefs.current[index + 1]?.focus();
  };

  const addCandidate = async (candidate: (typeof discovery.candidates)[number], customName?: string) => {
    setSavingIp(candidate.ipAddress);
    setError(null);
    try {
      const result = await registerCandidate({
        ipAddress: candidate.ipAddress,
        httpPort: candidate.httpPort,
        info: candidate.info,
        name: customName,
      });
      onToast(result.created ? `已添加 ${result.device.name}，正在连接` : `已更新 ${result.device.name}，正在连接`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '添加失败');
      return false;
    } finally {
      setSavingIp(null);
    }
  };

  const readBambuSerial = () => {
    setTask('serial');
    setError(null);
    setBambuHint(null);
    if (!isBambuLanIpv4(bambuIp)) {
      setError('请输入有效的 IPv4 地址');
      setTask(null);
      return;
    }
    if (!isPrivateIpv4(bambuIp)) {
      setError('请输入局域网 IPv4 地址');
      setTask(null);
      return;
    }
    if (readBambuMqttPort(bambuMqttPort) === null) {
      setError('MQTT 端口需在 1 到 65535 之间');
      setTask(null);
      return;
    }
    void identifyBambuHost({ ipAddress: bambuIp, mqttPort: bambuMqttPort })
      .then((identity) => {
        setBambuSerial(identity.serialNumber);
        setBambuHint(
          bambuAccessCode.trim()
            ? `已识别序列号 ${identity.serialNumber}`
            : buildBambuNeedAccessCodeMessage(identity.serialNumber),
        );
      })
      .catch((caught: unknown) => {
        setBambuSerial('');
        setError(caught instanceof Error ? caught.message : BAMBU_IDENTIFY_FAILED_MESSAGE);
      })
      .finally(() => setTask(null));
  };

  const connectBambu = (fields: { ipAddress: string; accessCode: string; serialNumber: string; mqttPort: string }) => {
    const accessCode = fields.accessCode.trim();
    setBambuIp(fields.ipAddress);
    setBambuAccessCode(accessCode);
    setBambuSerial(fields.serialNumber);
    setTask('add');
    setError(null);
    void runBambuManualConnectionTest(
      {
        ipAddress: fields.ipAddress,
        serialNumber: fields.serialNumber,
        accessCode,
        mqttPort: fields.mqttPort,
      },
      {
        identifyHost: identifyBambuHost,
        testLanConnection: testBambuLanConnection,
      },
    )
      .then(async (outcome) => {
        if (!sheetOpen.current || outcome.status === 'aborted') return;
        if (outcome.status === 'invalid-ip') {
          setError('请输入有效的 IPv4 地址');
          return;
        }
        if (outcome.status === 'invalid-lan') {
          setError('请输入局域网 IPv4 地址');
          return;
        }
        if (outcome.status === 'invalid-port') {
          setError('MQTT 端口需在 1 到 65535 之间');
          return;
        }
        if (
          outcome.status === 'identify-failed' ||
          outcome.status === 'need-access-code' ||
          outcome.status === 'mqtt-failed'
        ) {
          setError(outcome.message);
          const serial = outcome.identity?.serialNumber?.trim();
          if (serial) setBambuSerial(serial);
          return;
        }
        try {
          const result = await registerBambu({
            ipAddress: outcome.identity.ipAddress,
            mqttPort: outcome.identity.mqttPort,
            serialNumber: outcome.identity.serialNumber,
            accessCode,
            model: outcome.identity.model,
            name: outcome.identity.name,
            firmware: outcome.identity.version,
          });
          if (!sheetOpen.current) return;
          onToast(`已添加 ${result.device.name}`);
          onClose();
        } catch (caught) {
          setError(caught instanceof ProbeError ? caught.message : '添加失败');
        }
      })
      .finally(() => {
        if (sheetOpen.current) setTask(null);
      });
  };

  const addBambu = () => {
    connectBambu({
      ipAddress: bambuIp,
      accessCode: bambuAccessCode,
      serialNumber: bambuSerial,
      mqttPort: bambuMqttPort,
    });
  };

  const recognizeScreen = async (image: { base64: string; mimeType: string }) => {
    setCameraPhase('closing');
    if (task) return;
    setError(null);
    setTask('scan');
    let handedOff = false;
    try {
      const transcript = await extractAllText(image);
      if (!sheetOpen.current) return;
      if (brand?.driver === 'creality') {
        const found = parseCrealityScreen(transcript).ip;
        if (!found) {
          setError('没有识别到局域网 IP，请补全后再添加');
          return;
        }
        setIp(found);
        setTab('manual');
        setTask('probe');
        const probed = await probeManual(found, port);
        if (!sheetOpen.current) return;
        const added = await addCandidate(probed, name);
        if (added) onClose();
        return;
      }
      const identity = parseBambuScreen(transcript);
      if (identity.ip) setBambuIp(identity.ip);
      if (identity.code) setBambuAccessCode(identity.code);
      setBambuSerial('');
      setBambuHint(null);
      if (!identity.ip || !identity.code) {
        setError(identity.ip ? '没有识别到访问码，请补全后再添加' : '没有识别到 IP，请补全后再添加');
        return;
      }
      handedOff = true;
      connectBambu({
        ipAddress: identity.ip,
        accessCode: identity.code,
        serialNumber: '',
        mqttPort: bambuMqttPort,
      });
    } catch (caught) {
      if (!sheetOpen.current) return;
      setError(caught instanceof Error ? caught.message : '识别失败');
    } finally {
      if (!handedOff && sheetOpen.current) setTask(null);
    }
  };

  const formTitle =
    step === 'form' && brand?.driver === 'bambu'
      ? '添加拓竹设备'
      : step === 'form'
        ? '添加创想设备'
        : '选择设备品牌';

  const brandSubtitle = (item: (typeof DEVICE_BRANDS)[number]) => {
    if (!item.ready) return '尚未接入';
    if (item.driver === 'bambu') return '填写 IP 和访问码';
    if (item.driver === 'creality') return '局域网扫描或手动 IP';
    return '尚未接入';
  };

  return (
    <>
    <Modal visible={visible && cameraPhase === 'closed'} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/80 px-3">
        <Pressable className="absolute inset-0 z-0" onPress={onClose} />
        <View className="z-10 max-h-[88%] w-full overflow-hidden rounded-3xl border border-line bg-card">
          <View className="flex-row items-center justify-between border-b border-line bg-soft px-4 py-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-2.5 pr-2">
              {step === 'form' ? (
                <Pressable
                  accessibilityLabel="返回品牌"
                  onPress={() => {
                    stopScan();
                    setError(null);
                    setCameraPhase('closed');
                    setStep('brand');
                  }}
                  className="rounded-xl border border-line bg-soft p-2">
                  <ChevronLeft color="#4A4863" size={18} />
                </Pressable>
              ) : (
                <View className="rounded-xl border border-brand/25 bg-brand/10 p-2">
                  <Wifi color="#2AB381" size={18} />
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-xl font-medium text-ink">{formTitle}</Text>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {step === 'brand' ? '先选择品牌，再扫描或填写地址' : brand?.name || '创想三维 Creality'}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center">
              {step === 'form' ? (
                <Pressable
                  accessibilityLabel="扫描打印机屏幕"
                  hitSlop={12}
                  onPress={() => {
                    if (brand?.driver !== 'bambu' && brand?.driver !== 'creality') return;
                    if (cameraPhase !== 'closed') return;
                    setError(null);
                    setCameraPhase('opening');
                  }}
                  className="z-10 rounded-md p-2">
                  <View pointerEvents="none">
                    {task === 'scan' ? <ActivityIndicator color="#26225F" size="small" /> : <ScanLine color="#26225F" size={18} />}
                  </View>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} className="rounded-md p-2">
                <X color="#4A4863" size={18} />
              </Pressable>
            </View>
          </View>
          {step === 'brand' ? (
            <ScrollView className="px-4 py-4" contentContainerClassName="gap-2 pb-6">
              <Text className="px-1 text-xs text-muted">请选择要添加的打印机品牌。</Text>
              {error ? <Text className="px-1 text-sm text-danger">{error}</Text> : null}
              {DEVICE_BRANDS.map((item) => {
                const selected = item.id === brandId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => chooseBrand(item.id)}
                    className={`rounded-md border px-3.5 py-3 ${
                      selected ? 'border-brand/40 bg-brand/10' : 'border-line bg-soft'
                    }`}>
                    <Text className="text-base font-medium text-ink">{item.name}</Text>
                    <Text className={`mt-0.5 text-xs ${item.ready ? 'text-brand' : 'text-muted'}`}>
                      {brandSubtitle(item)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : isBambu ? (
            <ScrollView className="px-4 py-4" contentContainerClassName="gap-3 pb-6">
              {error ? <Text className="text-sm text-danger">{error}</Text> : null}
              <Text className="text-xs text-muted">
                输入 IP 后测试连接。序列号从 8883 证书读取，这一步不建立 MQTT。
              </Text>
              <Field
                label="打印机局域网 IP 地址"
                value={bambuIp}
                onChangeText={(value) => {
                  setBambuIp(value);
                  setBambuSerial('');
                  setBambuHint(null);
                }}
                placeholder="192.168.1.20"
              />
              <Pressable
                disabled={busy}
                onPress={readBambuSerial}
                className={`items-center rounded-md py-3 ${busy ? 'bg-soft' : 'bg-brand'}`}>
                <Text className="text-sm font-semibold text-ink">{task === 'serial' ? '正在识别序列号' : '测试连接'}</Text>
              </Pressable>
              <View className="gap-1">
                <Text className="text-sm font-medium text-muted">序列号</Text>
                <Text className="rounded-md border border-line bg-soft px-3.5 py-2.5 font-mono text-sm text-ink">
                  {bambuSerial || '测试连接后自动填入'}
                </Text>
              </View>
              {bambuHint ? <Text className="text-xs text-brand">{bambuHint}</Text> : null}
              <Field
                label="访问码"
                value={bambuAccessCode}
                onChangeText={setBambuAccessCode}
                placeholder="访问码"
              />
              <Field
                label="MQTT 端口"
                value={bambuMqttPort}
                onChangeText={(value) => {
                  setBambuMqttPort(value);
                  setBambuSerial('');
                  setBambuHint(null);
                }}
                placeholder="8883"
              />
              <Pressable
                disabled={!canAddBambu || busy}
                onPress={addBambu}
                className={`items-center rounded-md py-3 ${!canAddBambu || busy ? 'bg-soft' : 'bg-brand'}`}>
                <Text className="text-sm font-semibold text-ink">
                  {task === 'scan' ? '正在识别' : task === 'add' ? '正在添加' : '添加'}
                </Text>
              </Pressable>
            </ScrollView>
          ) : (
            <>
          <View className="border-b border-line bg-soft px-3 py-3">
            <View className="flex-row rounded-xl bg-line p-1">
              <Pressable
                onPress={() => setTab('scan')}
                className={`flex-1 items-center rounded-lg py-2 ${tab === 'scan' ? 'bg-card' : ''}`}>
                <Text className={`text-sm font-semibold ${tab === 'scan' ? 'text-ink' : 'text-muted'}`}>
                  自动扫描局域网
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab('manual')}
                className={`flex-1 items-center rounded-lg py-2 ${tab === 'manual' ? 'bg-card' : ''}`}>
                <Text className={`text-sm font-semibold ${tab === 'manual' ? 'text-ink' : 'text-muted'}`}>
                  手动输入 IP 添加
                </Text>
              </Pressable>
            </View>
          </View>
          <ScrollView className="px-4 py-4" contentContainerClassName="gap-3 pb-6">
            {error ? <Text className="text-sm text-danger">{error}</Text> : null}
            {tab === 'scan' ? (
              <>
                <View className="gap-2 rounded-2xl border border-line bg-soft p-3.5">
                  <Text className="text-xl font-medium text-ink">扫描网段</Text>
                  <View className="flex-row items-center gap-1">
                    {SEGMENT_KEYS.map((key, index) => (
                      <View key={key} className="min-w-0 flex-1 flex-row items-center gap-1">
                        {index > 0 ? <Text className="text-muted">.</Text> : null}
                        <TextInput
                          ref={(node) => {
                            segmentRefs.current[index] = node;
                          }}
                          value={segments[key]}
                          editable={!scanning}
                          onChangeText={(value) => changeSegment(index, value)}
                          keyboardType={key === 'd' ? 'numbers-and-punctuation' : 'number-pad'}
                          placeholder={key === 'd' ? '1-254' : ''}
                          placeholderTextColor="#9A98AB"
                          autoCapitalize="none"
                          autoCorrect={false}
                          className="min-w-0 flex-1 rounded-md border border-line bg-soft px-1 py-2 text-center font-mono text-sm text-ink"
                        />
                      </View>
                    ))}
                  </View>
                  <Text className="text-xs text-muted">前三段默认是本机网段，可改。末段留空则扫描 1–254。</Text>
                  <Pressable
                    onPress={() => {
                      if (scanning) {
                        stopScan();
                        return;
                      }
                      setError(null);
                      void startScan(segments).then((result) => {
                        if (!result.ok) setError(result.message);
                      });
                    }}
                    className={`items-center rounded-md px-3 py-2 ${scanning ? 'bg-amber-600' : 'bg-brand'}`}>
                    <Text className="text-sm font-semibold text-ink">{scanning ? '停止' : '开始扫描'}</Text>
                  </Pressable>
                  {discovery.message ? (
                    <Text className="text-xs text-muted">
                      {discovery.subnet ? `${discovery.subnet} · ` : ''}
                      {discovery.message}
                      {scanning ? ` · ${discovery.completedCount}/${discovery.total}` : ''}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-sm font-medium text-muted">
                  发现的创想打印机 ({discovery.candidates.length})
                </Text>
                {discovery.candidates.map((candidate) => {
                  const added = devices.some(
                    (device) => device.ipAddress === candidate.ipAddress && device.httpPort === candidate.httpPort,
                  );
                  const modelName = resolveCrealityDisplayModel(candidate.info.model);
                  const label = candidate.info.hostname || modelName || 'Creality';
                  const saving = savingIp === candidate.ipAddress;
                  return (
                    <View
                      key={candidate.ipAddress}
                      className="flex-row items-center justify-between gap-2 rounded-2xl border border-line bg-soft px-3 py-3">
                      <View className="min-w-0 flex-1 flex-row items-center gap-2">
                        <ModelThumb model={candidate.info.model} size={32} />
                        <View className="min-w-0 flex-1">
                          <Text className="text-base font-medium text-ink" numberOfLines={1}>
                            {label}
                          </Text>
                          <Text className="mt-0.5 font-mono text-xs text-brand" numberOfLines={1}>
                            {candidate.ipAddress}:{candidate.httpPort}
                            {modelName ? ` · ${modelName}` : ''}
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        disabled={added || saving}
                        onPress={() => void addCandidate(candidate)}
                        className={`flex-row items-center gap-1 rounded-xl px-2.5 py-1.5 ${added ? 'bg-soft' : 'bg-brand'}`}>
                        {saving ? <ActivityIndicator color="#101010" size="small" /> : null}
                        {added ? <Check color="#4A4863" size={14} /> : saving ? null : <Plus color="#101010" size={14} />}
                        <Text className="text-sm font-semibold text-ink">{added ? '已添加' : '添加'}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </>
            ) : (
              <View className="gap-3">
                <Field label="打印机局域网 IP 地址" value={ip} onChangeText={setIp} placeholder="192.168.1.10" />
                <Field label="HTTP 端口，留空为 80" value={port} onChangeText={setPort} placeholder="80" />
                <Field label="备注名称，留空则使用打印机名称" value={name} onChangeText={setName} placeholder="工位机" />
                <Pressable
                  disabled={task === 'probe'}
                  onPress={() => {
                    setTask('probe');
                    setError(null);
                    void probeManual(ip, port)
                      .then((probed) => addCandidate(probed, name))
                      .then((added) => {
                        if (added) onClose();
                      })
                      .catch((caught: unknown) => {
                        setError(caught instanceof ProbeError ? caught.message : '无法连接这台设备');
                      })
                      .finally(() => setTask(null));
                  }}
                  className={`items-center rounded-md py-3 ${task === 'probe' ? 'bg-soft' : 'bg-brand'}`}>
                  <Text className="text-sm font-semibold text-ink">{task === 'probe' ? '正在确认设备' : '确认并添加'}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
    <ScreenCamera
      visible={cameraPhase === 'open' && (isBambu || brand?.driver === 'creality')}
      hint={isBambu ? '对准屏幕上的 IP 和访问码' : '对准屏幕上的 IP'}
      onClose={() => setCameraPhase('closing')}
      onImage={(image) => void recognizeScreen(image)}
    />
    </>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-muted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#9A98AB"
        className="rounded-md border border-line bg-soft px-3.5 py-2.5 font-mono text-sm text-ink"
      />
    </View>
  );
}
