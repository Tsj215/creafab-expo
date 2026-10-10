import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F8F8' }} edges={['top']}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-semibold text-ink">{title}</Text>
        <Text className="mt-2 text-center text-base text-muted">这一页下一步再补界面</Text>
      </View>
    </SafeAreaView>
  );
}
