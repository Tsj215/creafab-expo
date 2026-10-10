import { Tabs } from 'expo-router';
import { FolderOpen, LayoutGrid, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#26225F',
        tabBarInactiveTintColor: '#4A4863',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E4E2EC',
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '设备',
          tabBarIcon: ({ color }) => <LayoutGrid color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="control"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: '文件',
          tabBarIcon: ({ color }) => <FolderOpen color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color }) => <Settings color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
