import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { Camera, ChevronLeft, Copy, ImageIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractAllText, extractPrinterScreen, loadDeepseekKey, screenImageFromBase64, type DeviceIdentity } from '@/src/ai/deepseek';

type PickedImage = {
  uri: string;
  base64: string;
  mimeType: string;
};

export function OcrScreen() {
  const [hasKey, setHasKey] = useState(false);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'identity' | 'text' | null>(null);
  const [copied, setCopied] = useState<'ip' | 'code' | 'text' | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadDeepseekKey().then((value) => setHasKey(Boolean(value)));
    }, []),
  );

  const pick = async (source: 'camera' | 'library') => {
    setError('');
    setCopied(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(source === 'camera' ? '需要相机权限才能拍摄' : '需要相册权限才能选择图片');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            base64: true,
          });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const imageData = asset.base64 ? screenImageFromBase64(asset.base64, asset.mimeType) : null;
    if (!imageData || !asset.uri) {
      setError('没有读到图片数据，请换一张再试');
      return;
    }
    setImage({
      uri: asset.uri,
      base64: imageData.base64,
      mimeType: imageData.mimeType,
    });
    setIdentity(null);
    setTranscript('');
  };

  const extract = async () => {
    if (!image || busy) return;
    setBusy('identity');
    setError('');
    setCopied(null);
    try {
      const apiKey = await loadDeepseekKey();
      setHasKey(Boolean(apiKey));
      const result = await extractPrinterScreen(image);
      setIdentity(result);
    } catch (err) {
      setIdentity(null);
      setError(err instanceof Error ? err.message : '识别失败');
    } finally {
      setBusy(null);
    }
  };

  const extractText = async () => {
    if (!image || busy) return;
    setBusy('text');
    setError('');
    setCopied(null);
    try {
      const apiKey = await loadDeepseekKey();
      setHasKey(Boolean(apiKey));
      setTranscript(await extractAllText(image));
    } catch (err) {
      setTranscript('');
      setError(err instanceof Error ? err.message : '识别失败');
    } finally {
      setBusy(null);
    }
  };

  const copyText = async () => {
    if (!transcript) return;
    await Clipboard.setStringAsync(transcript);
    setCopied('text');
  };

  const copy = async (field: 'ip' | 'code') => {
    const value = identity?.[field];
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(field);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F8F8' }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-2">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-md" hitSlop={8}>
          <ChevronLeft color="#4A4863" size={22} />
        </Pressable>
        <Text className="text-2xl font-semibold text-ink">图像识字</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-8" keyboardShouldPersistTaps="handled">
        {!hasKey ? (
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            className="rounded-md border border-warn/40 bg-warn/10 p-3">
            <Text className="text-sm text-warn">还没有 DeepSeek API Key，先去设置里保存。</Text>
          </Pressable>
        ) : null}

        <View className="h-64 items-center justify-center overflow-hidden rounded-md border border-line bg-card">
          {image?.uri ? (
            <Image source={{ uri: image.uri }} className="h-full w-full" resizeMode="contain" />
          ) : (
            <Text className="px-6 text-center text-base text-muted">拍摄打印机屏幕，需看清 IP 和访问码</Text>
          )}
        </View>

        <View className="flex-row gap-2">
          {Platform.OS === 'web' ? null : (
            <Pressable
              onPress={() => void pick('camera')}
              className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-md border border-muted/30">
              <Camera color="#4A4863" size={16} />
              <Text className="text-sm font-semibold text-ink">拍照</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => void pick('library')}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-md border border-muted/30">
            <ImageIcon color="#4A4863" size={16} />
            <Text className="text-sm font-semibold text-ink">相册</Text>
          </Pressable>
        </View>

        <Pressable
          disabled={!image || Boolean(busy) || !hasKey}
          onPress={() => void extract()}
          className={`min-h-11 items-center justify-center rounded-md ${image && hasKey ? 'bg-brand' : 'bg-soft'}`}>
          {busy === 'identity' ? (
            <ActivityIndicator color="#101010" />
          ) : (
            <Text className={`text-sm font-semibold ${image && hasKey ? 'text-ink' : 'text-muted'}`}>
              提取 IP 和访问码
            </Text>
          )}
        </Pressable>
        <Pressable
          disabled={!image || Boolean(busy) || !hasKey}
          onPress={() => void extractText()}
          className={`min-h-11 items-center justify-center rounded-md border ${image && hasKey ? 'border-deep/25' : 'border-line bg-soft'}`}>
          {busy === 'text' ? (
            <ActivityIndicator color="#4A4863" />
          ) : (
            <Text className={`text-sm font-semibold ${image && hasKey ? 'text-ink' : 'text-muted'}`}>
              提取所有文本
            </Text>
          )}
        </Pressable>

        {error ? <Text className="text-sm text-danger">{error}</Text> : null}

        {transcript ? (
          <View className="gap-2 rounded-md border border-line bg-card p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-muted">全部文字</Text>
              <Pressable onPress={() => void copyText()} className="flex-row items-center gap-1 rounded-md px-2 py-1">
                <Copy color="#26225F" size={14} />
                <Text className="text-sm font-semibold text-deep">{copied === 'text' ? '已复制' : '复制'}</Text>
              </Pressable>
            </View>
            <Text selectable className="font-mono text-base leading-6 text-ink">
              {transcript}
            </Text>
          </View>
        ) : null}

        {identity ? (
          <View className="gap-3 rounded-md border border-line bg-card p-4">
            <IdentityRow
              label="设备 IP"
              value={identity.ip}
              copied={copied === 'ip'}
              onCopy={() => void copy('ip')}
            />
            <IdentityRow
              label="访问码"
              value={identity.code}
              copied={copied === 'code'}
              onCopy={() => void copy('code')}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function IdentityRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted">{label}</Text>
      <View className="flex-row items-center justify-between gap-3">
        <Text selectable className="min-w-0 flex-1 font-mono text-base text-ink">
          {value || '未识别到'}
        </Text>
        {value ? (
          <Pressable onPress={onCopy} className="flex-row items-center gap-1 rounded-md px-2 py-1">
            <Copy color="#26225F" size={14} />
            <Text className="text-sm font-semibold text-deep">{copied ? '已复制' : '复制'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
