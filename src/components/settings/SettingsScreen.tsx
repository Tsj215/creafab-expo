import { router } from 'expo-router';
import { ChevronRight, Eye, EyeOff, ScanText } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadDeepseekKey, maskDeepseekKey, saveDeepseekKey, testDeepseekKey } from '@/src/ai/deepseek';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [apiKey, setApiKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [savedMask, setSavedMask] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void loadDeepseekKey().then((value) => {
      setApiKey(value);
      setSavedMask(value ? maskDeepseekKey(value) : '');
    });
  }, []);

  const save = async () => {
    setBusy('save');
    setNotice(null);
    try {
      await saveDeepseekKey(apiKey);
      const stored = await loadDeepseekKey();
      setApiKey(stored);
      setSavedMask(stored ? maskDeepseekKey(stored) : '');
      setNotice({ ok: true, text: stored ? '已保存到本机' : '已清除本机 Key' });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setNotice(null);
    try {
      await testDeepseekKey(apiKey);
      setNotice({ ok: true, text: '连接成功' });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : '连接失败' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F8F8' }} edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: 72 + insets.bottom }}
        keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-semibold text-ink">设置</Text>

        <View className="gap-3 rounded-md border border-line bg-card p-4">
          <Text className="text-xl font-medium text-ink">DeepSeek</Text>
          <Text className="text-base leading-6 text-muted">
            用于从打印机屏幕照片里读取 IP 和访问码。Key 只保存在这台设备上，选中的图片会发送到 DeepSeek。
          </Text>
          <Text className="text-xs text-muted">
            {savedMask ? `当前已保存 ${savedMask}` : '尚未保存 Key'}
          </Text>
          <View className="flex-row items-center rounded-md border border-line bg-soft">
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!reveal}
              placeholder="粘贴 DeepSeek API Key"
              placeholderTextColor="#9A98AB"
              className="min-h-11 flex-1 px-3 text-sm text-ink"
            />
            <Pressable className="px-3 py-3" onPress={() => setReveal((value) => !value)} hitSlop={8}>
              {reveal ? <EyeOff color="#4A4863" size={18} /> : <Eye color="#4A4863" size={18} />}
            </Pressable>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              disabled={busy !== null}
              onPress={() => void save()}
              className="min-h-11 flex-1 items-center justify-center rounded-md bg-brand">
              {busy === 'save' ? (
                <ActivityIndicator color="#101010" />
              ) : (
                <Text className="text-sm font-semibold text-ink">保存</Text>
              )}
            </Pressable>
            <Pressable
              disabled={busy !== null}
              onPress={() => void test()}
              className="min-h-11 flex-1 items-center justify-center rounded-md border border-muted/30">
              {busy === 'test' ? (
                <ActivityIndicator color="#4A4863" />
              ) : (
                <Text className="text-sm font-semibold text-ink">测试连接</Text>
              )}
            </Pressable>
          </View>
          {notice ? (
            <Text className={notice.ok ? 'text-sm text-brand' : 'text-sm text-danger'}>{notice.text}</Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => router.push('/ocr')}
          className="flex-row items-center gap-3 rounded-md border border-line bg-card p-4">
          <View className="h-10 w-10 items-center justify-center rounded-md bg-soft">
            <ScanText color="#26225F" size={20} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-base font-medium text-ink">图像识字</Text>
            <Text className="mt-1 text-xs text-muted">拍照或从相册选择，只读取 IP 和访问码</Text>
          </View>
          <ChevronRight color="#4A4863" size={18} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
