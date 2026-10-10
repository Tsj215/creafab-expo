import * as Network from 'expo-network';
import { Platform } from 'react-native';

import { isPrivateIpv4, parseIpv4 } from '@/src/runtime/net';

export type LanSubnet = {
  prefix: string;
  address: string;
};

export async function readLanSubnet(): Promise<LanSubnet | { error: string }> {
  if (Platform.OS === 'web') {
    return { error: '网页端不能扫描局域网，请改用手动 IP' };
  }

  try {
    const state = await Network.getNetworkStateAsync();
    if (state.type === Network.NetworkStateType.CELLULAR) {
      return { error: '当前是蜂窝网络，请改用手动 IP' };
    }
    if (state.isConnected === false || state.type === Network.NetworkStateType.NONE) {
      return { error: '没有可用网络，请改用手动 IP' };
    }
  } catch {
    return { error: '读不到网络状态，请改用手动 IP' };
  }

  let address = '';
  try {
    address = await Network.getIpAddressAsync();
  } catch {
    return { error: '读不到本机地址，请改用手动 IP' };
  }

  if (!isPrivateIpv4(address) || !parseIpv4(address)) {
    return { error: '当前地址不在局域网，请改用手动 IP' };
  }

  const [a, b, c] = address.split('.');
  return { prefix: `${a}.${b}.${c}`, address };
}
