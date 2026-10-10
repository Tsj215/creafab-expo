import { screenImageFromBase64 } from '@/src/ai/deepseek';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { ImageIcon, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type CapturedScreen = {
  base64: string;
  mimeType: string;
};

export function ScreenCamera({
  visible,
  hint = '对准屏幕上的 IP 和访问码',
  onClose,
  onImage,
}: {
  visible: boolean;
  hint?: string;
  onClose: () => void;
  onImage: (image: CapturedScreen) => void;
}) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [notice, setNotice] = useState('');
  const [capturing, setCapturing] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      setNotice('');
      setCapturing(false);
      return;
    }
    if (!permission || permission.granted || permission.canAskAgain === false) return;
    void requestPermission();
  }, [permission, requestPermission, visible]);

  const finish = (base64: string, mimeType: string) => {
    const image = screenImageFromBase64(base64, mimeType);
    if (!image) {
      setNotice('没有读到图片数据，请重试');
      return;
    }
    onImage(image);
  };

  const shoot = async () => {
    if (capturing || !permission?.granted) return;
    setCapturing(true);
    setNotice('');
    try {
      const picture = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.85, imageType: 'jpg' });
      if (!picture?.base64) {
        setNotice('没有拍到照片，请重试');
        return;
      }
      finish(picture.base64, 'image/jpeg');
    } catch {
      setNotice('拍照失败，请重试');
    } finally {
      setCapturing(false);
    }
  };

  const pickLibrary = async () => {
    if (capturing) return;
    setNotice('');
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setNotice('需要相册权限才能选择图片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      setNotice('没有读到图片数据，请重新选择');
      return;
    }
    finish(asset.base64, asset.mimeType || 'image/jpeg');
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {visible && permission?.granted ? (
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" mode="picture" mute />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-sm text-slate-300">
              {permission && !permission.granted ? '需要相机权限才能拍摄，仍可从右下角选择照片' : '正在打开相机'}
            </Text>
            {permission && !permission.granted && permission.canAskAgain ? (
              <Pressable onPress={() => void requestPermission()} className="mt-4 rounded-md bg-white px-4 py-2">
                <Text className="text-sm font-semibold text-slate-950">允许使用相机</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View className="absolute left-0 right-0 px-4" style={{ top: insets.top + 12 }}>
          <View className="flex-row items-center justify-between">
            <Pressable accessibilityLabel="关闭相机" onPress={onClose} className="rounded-md bg-black/40 p-2">
              <X color="#ffffff" size={22} />
            </Pressable>
            <Text className="mx-3 flex-1 text-center text-xs text-white">{hint}</Text>
            <View className="w-10" />
          </View>
        </View>

        <View className="absolute left-0 right-0 items-center" style={{ bottom: insets.bottom + 28 }}>
          {notice ? <Text className="mb-3 px-6 text-center text-xs text-rose-300">{notice}</Text> : null}
          <Pressable
            accessibilityLabel="拍照"
            disabled={capturing || !permission?.granted}
            onPress={() => void shoot()}
            className="h-16 w-16 items-center justify-center rounded-full border-4 border-white">
            {capturing ? <ActivityIndicator color="#ffffff" /> : <View className="h-12 w-12 rounded-full bg-white" />}
          </Pressable>
          <Pressable
            accessibilityLabel="从相册选择"
            disabled={capturing}
            onPress={() => void pickLibrary()}
            className="absolute bottom-1 right-6 h-12 w-12 items-center justify-center rounded-md border border-white/80 bg-black/40">
            <ImageIcon color="#ffffff" size={22} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
