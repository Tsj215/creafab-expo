import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Check, ChevronLeft, Plus, Wifi, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StatusBar as RNStatusBar, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { extractAllText } from '@/src/ai/deepseek';
import { ScreenCamera } from '@/src/components/devices/ScreenCamera';
import { ModelThumb } from '@/src/components/devices/model-thumb';
import {
  BAMBU_IDENTIFY_FAILED_MESSAGE,
  buildBambuNeedAccessCodeMessage,
  canSubmitBambuManualAdd,
  isBambuLanIpv4,
  readBambuMqttPort,
  runBambuManualConnectionTest,
} from '@/src/runtime/bambu-add';
import { identifyBambuHost, testBambuLanConnection } from '@/src/runtime/bambu-lan';
import { parseBambuScreen } from '@/src/runtime/bambu-screen';
import { DEVICE_BRANDS, findDeviceBrand } from '@/src/runtime/brands';
import { ProbeError } from '@/src/runtime/creality-info';
import { resolveCrealityDisplayModel } from '@/src/runtime/creality-model';
import { parseCrealityScreen } from '@/src/runtime/creality-screen';
import { defaultScanSegments, isPrivateIpv4, ScanSegments } from '@/src/runtime/net';
import { prepareScan, probeManual, registerBambu, registerCandidate, startScan, stopScan } from '@/src/runtime/runtime';
import { useRuntime } from '@/src/runtime/use-runtime';

const SEGMENT_KEYS = ['a', 'b', 'c', 'd'] as const;

export function AddDeviceScreen() {
  const insets = useSafeAreaInsets();
  const topInset =
    Platform.OS === 'ios' ? 12 : Platform.OS === 'android' ? Math.max(insets.top, RNStatusBar.currentHeight ?? 0) : 0;
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
  const [savingIp, setSavingIp] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mounted = useRef(true);
  const segmentRefs = useRef<Array<TextInput | null>>([]);
  const segmentsTouched = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanning = discovery.status === 'running';
  const brand = findDeviceBrand(brandId ?? '');
  const isBambu = brand?.driver === 'bambu';
  const busy = task !== null;
  const canAddBambu = canSubmitBambuManualAdd({ ipAddress: bambuIp, accessCode: bambuAccessCode });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopScan();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (cameraPhase !== 'opening' && cameraPhase !== 'closing') return;
    const timer = setTimeout(
      () => setCameraPhase((phase) => (phase === 'opening' ? 'open' : phase === 'closing' ? 'closed' : phase)),
      Platform.OS === 'ios' ? 400 : 50,
    );
    return () => clearTimeout(timer);
  }, [cameraPhase]);

  useEffect(() => {
    if (step !== 'form' || brand?.driver !== 'creality') return;
    setError(null);
    segmentsTouched.current = false;
    let active = true;
    void prepareScan().then((result) => {
      if (!active || segmentsTouched.current || !mounted.current) return;
      setSegments(defaultScanSegments(result.address));
    });
    return () => {
      active = false;
      stopScan();
    };
  }, [brand?.driver, step]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      if (mounted.current) setToast(null);
    }, 2200);
  };

  const closePage = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (mounted.current) closePage();
    }, 800);
  };

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
      if (!mounted.current) return false;
      showToast(result.created ? `已添加 ${result.device.name}，正在连接` : `已更新 ${result.device.name}，正在连接`);
      return true;
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : '添加失败');
      return false;
    } finally {
      if (mounted.current) setSavingIp(null);
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
        if (!mounted.current) return;
        setBambuSerial(identity.serialNumber);
        setBambuHint(
          bambuAccessCode.trim()
            ? `已识别序列号 ${identity.serialNumber}`
            : buildBambuNeedAccessCodeMessage(identity.serialNumber),
        );
      })
      .catch((caught: unknown) => {
        if (!mounted.current) return;
        setBambuSerial('');
        setError(caught instanceof Error ? caught.message : BAMBU_IDENTIFY_FAILED_MESSAGE);
      })
      .finally(() => {
        if (mounted.current) setTask(null);
      });
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
        if (!mounted.current || outcome.status === 'aborted') return;
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
          if (!mounted.current) return;
          showToast(`已添加 ${result.device.name}`);
          scheduleClose();
        } catch (caught) {
          if (mounted.current) setError(caught instanceof ProbeError ? caught.message : '添加失败');
        }
      })
      .finally(() => {
        if (mounted.current) setTask(null);
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
      if (!mounted.current) return;
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
        if (!mounted.current) return;
        const added = await addCandidate(probed, name);
        if (added) scheduleClose();
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
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught.message : '识别失败');
    } finally {
      if (!handedOff && mounted.current) setTask(null);
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
    <View
      style={{
        backgroundColor: '#FFFFFF',
        paddingTop: Platform.OS === 'ios' ? 16 : topInset,
        paddingBottom: insets.bottom,
      }}>
      <StatusBar style="dark" />
      <View style={{ flexShrink: 0 }} className="flex-row items-center justify-between bg-card px-4 py-3">
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
              className="rounded-md bg-soft p-2">
              <ChevronLeft color="#4A4863" size={18} />
            </Pressable>
          ) : (
            <View className="rounded-md border border-brand/25 bg-brand/10 p-2">
              <Wifi color="#2AB381" size={18} />
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text className="text-xl font-medium text-ink">{formTitle}</Text>
          </View>
        </View>
        <View className="flex-row items-center">
          <Pressable accessibilityLabel="关闭" onPress={closePage} className="rounded-md p-2">
            <X color="#4A4863" size={18} />
          </Pressable>
        </View>
      </View>
      <View>
        {step === 'brand' ? (
          <View className="gap-2 px-4 py-4">
            {error ? <Text className="px-1 text-sm text-danger">{error}</Text> : null}
            {DEVICE_BRANDS.map((item) => {
              const selected = item.id === brandId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => chooseBrand(item.id)}
                  className={`rounded-md px-3.5 py-3 ${
                    selected ? 'bg-brand/10' : 'bg-soft'
                  }`}>
                  <Text className="text-base font-medium text-ink">{item.name}</Text>
                  <Text className={`mt-0.5 text-xs ${item.ready ? 'text-brand' : 'text-muted'}`}>
                    {brandSubtitle(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : isBambu ? (
          <View className="gap-3 px-4 py-4">
            {error ? <Text className="text-sm text-danger">{error}</Text> : null}
            <Text className="text-xs text-muted">输入 IP 后测试连接。序列号从 8883 证书读取，这一步不建立 MQTT。</Text>
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
            <Field label="访问码" value={bambuAccessCode} onChangeText={setBambuAccessCode} placeholder="访问码" />
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
          </View>
        ) : (
          <View className="gap-3 px-4 py-4">
              <View className="flex-row rounded-md bg-line p-1">
                <Pressable
                  onPress={() => setTab('scan')}
                  className={`flex-1 items-center rounded-md py-2 ${tab === 'scan' ? 'bg-card' : ''}`}>
                  <Text className={`text-sm font-semibold ${tab === 'scan' ? 'text-ink' : 'text-muted'}`}>
                    自动扫描局域网
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTab('manual')}
                  className={`flex-1 items-center rounded-md py-2 ${tab === 'manual' ? 'bg-card' : ''}`}>
                  <Text className={`text-sm font-semibold ${tab === 'manual' ? 'text-ink' : 'text-muted'}`}>
                    手动输入 IP 添加
                  </Text>
                </Pressable>
              </View>
            <View className="gap-3">
              {error ? <Text className="text-sm text-danger">{error}</Text> : null}
              {tab === 'scan' ? (
                <>
                  <View className="gap-2 rounded-2xl bg-soft p-3.5">
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
                          if (!result.ok && mounted.current) setError(result.message);
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
                  <Text className="text-sm font-medium text-muted">发现的创想打印机 ({discovery.candidates.length})</Text>
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
                          className={`flex-row items-center gap-1 rounded-md px-2.5 py-1.5 ${added ? 'bg-soft' : 'bg-brand'}`}>
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
                          if (added) scheduleClose();
                        })
                        .catch((caught: unknown) => {
                          if (mounted.current) setError(caught instanceof ProbeError ? caught.message : '无法连接这台设备');
                        })
                        .finally(() => {
                          if (mounted.current) setTask(null);
                        });
                    }}
                    className={`items-center rounded-md py-3 ${task === 'probe' ? 'bg-soft' : 'bg-brand'}`}>
                    <Text className="text-sm font-semibold text-ink">{task === 'probe' ? '正在确认设备' : '确认并添加'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
      {toast ? (
        <View className="absolute left-4 right-4 z-50 rounded-md bg-deep px-4 py-2.5" style={{ top: topInset + 12 }}>
          <Text className="text-center text-sm font-semibold text-white">{toast}</Text>
        </View>
      ) : null}
      <ScreenCamera
        visible={cameraPhase === 'open' && (isBambu || brand?.driver === 'creality')}
        hint={isBambu ? '对准屏幕上的 IP 和访问码' : '对准屏幕上的 IP'}
        onClose={() => setCameraPhase('closing')}
        onImage={(image) => void recognizeScreen(image)}
      />
    </View>
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
