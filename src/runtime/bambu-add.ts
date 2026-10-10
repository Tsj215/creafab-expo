/**
 * 拓竹手动添加的校验顺序，与 creafab-one 一致：
 * 1. IP 必须是合法 IPv4
 * 2. 序列号为空时先识别，这一步不建立 MQTT
 * 3. 没有访问码就停住，把序列号交回表单
 * 4. 有访问码才做 MQTT 握手；失败不写档案
 */
import { isPrivateIpv4, parsePort } from '@/src/runtime/net';
import { BAMBU_MQTT_PORT } from '@/src/runtime/types';

export const BAMBU_IDENTIFY_FAILED_MESSAGE =
  '未能从 8883 端口或局域网宣告识别序列号，请检查 IP 或手动填写。';
export const BAMBU_MQTT_FAILED_MESSAGE = '连接测试失败，请检查 IP / 序列号 / 访问码。';

export type BambuDiscoverySource = 'none' | 'tls-cert' | 'ssdp' | 'claimed' | 'mqtt-port';

export type BambuHostIdentity = {
  ipAddress: string;
  mqttPort: number;
  reachable: boolean;
  serialNumber: string;
  model: string;
  name: string;
  version: string;
  discoverySource: BambuDiscoverySource;
};

export type BambuMqttHandshake = {
  ok: boolean;
  message?: string;
  serialNumber?: string;
  model?: string;
  firmware?: string;
};

export type BambuManualConnectionOutcome =
  | { status: 'invalid-ip' }
  | { status: 'invalid-lan' }
  | { status: 'invalid-port' }
  | { status: 'aborted' }
  | { status: 'identify-failed'; message: string; identity?: BambuHostIdentity }
  | { status: 'need-access-code'; identity: BambuHostIdentity; message: string }
  | { status: 'mqtt-failed'; identity: BambuHostIdentity; message: string }
  | { status: 'mqtt-success'; identity: BambuHostIdentity; mqtt: BambuMqttHandshake };

export type BambuAddApis = {
  identifyHost: (input: {
    ipAddress: string;
    mqttPort?: string;
    signal?: AbortSignal;
  }) => Promise<BambuHostIdentity>;
  testLanConnection: (input: {
    ipAddress: string;
    serialNumber: string;
    accessCode: string;
    mqttPort?: string;
  }) => Promise<BambuMqttHandshake>;
};

export function isBambuLanIpv4(value: string) {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

/** 空端口用 8883。超出 1–65535 或不是整数时返回 null。 */
export function readBambuMqttPort(value?: string) {
  return parsePort(value ?? '', BAMBU_MQTT_PORT);
}

export function buildBambuNeedAccessCodeMessage(serialNumber: string) {
  const serial = serialNumber.trim();
  return serial ? `已识别序列号 ${serial}，请填写访问码后即可添加。` : '请填写访问码后即可添加。';
}

/** IP 有效且已填访问码即可点添加。序列号可以在添加过程中识别。 */
export function canSubmitBambuManualAdd(input: { ipAddress: string; accessCode: string }) {
  return isBambuLanIpv4(input.ipAddress.trim()) && Boolean(input.accessCode.trim());
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function buildKnownIdentity(input: {
  ipAddress: string;
  mqttPort?: string;
  serialNumber: string;
  identity?: BambuHostIdentity;
}): BambuHostIdentity {
  return (
    input.identity ?? {
      ipAddress: input.ipAddress,
      mqttPort: readBambuMqttPort(input.mqttPort) ?? BAMBU_MQTT_PORT,
      reachable: true,
      serialNumber: input.serialNumber,
      model: '',
      name: '',
      version: '',
      discoverySource: 'none',
    }
  );
}

export async function runBambuManualConnectionTest(
  input: {
    ipAddress: string;
    serialNumber: string;
    accessCode: string;
    mqttPort: string;
    signal?: AbortSignal;
  },
  apis: BambuAddApis,
): Promise<BambuManualConnectionOutcome> {
  const ipAddress = input.ipAddress.trim();
  if (!isBambuLanIpv4(ipAddress)) {
    return { status: 'invalid-ip' };
  }
  if (!isPrivateIpv4(ipAddress)) {
    return { status: 'invalid-lan' };
  }
  const mqttPort = readBambuMqttPort(input.mqttPort);
  if (mqttPort === null) {
    return { status: 'invalid-port' };
  }

  let serialNumber = input.serialNumber.trim();
  let identity: BambuHostIdentity | undefined;

  try {
    if (!serialNumber) {
      identity = await apis.identifyHost({
        ipAddress,
        mqttPort: String(mqttPort),
        signal: input.signal,
      });
      serialNumber = identity.serialNumber.trim();
      if (!serialNumber) {
        return {
          status: 'identify-failed',
          message: BAMBU_IDENTIFY_FAILED_MESSAGE,
          identity,
        };
      }
    }

    const resolvedIdentity = {
      ...buildKnownIdentity({
        ipAddress,
        mqttPort: String(mqttPort),
        serialNumber,
        identity,
      }),
      mqttPort,
    };

    if (!input.accessCode.trim()) {
      return {
        status: 'need-access-code',
        identity: resolvedIdentity,
        message: buildBambuNeedAccessCodeMessage(serialNumber),
      };
    }

    const result = await apis.testLanConnection({
      ipAddress,
      serialNumber,
      accessCode: input.accessCode.trim(),
      mqttPort: String(mqttPort),
    });
    if (!result.ok) {
      return {
        status: 'mqtt-failed',
        identity: resolvedIdentity,
        message: result.message || BAMBU_MQTT_FAILED_MESSAGE,
      };
    }

    return {
      status: 'mqtt-success',
      identity: {
        ...resolvedIdentity,
        serialNumber: result.serialNumber?.trim() || serialNumber,
        model: result.model?.trim() || resolvedIdentity.model,
        version: result.firmware?.trim() || resolvedIdentity.version,
      },
      mqtt: result,
    };
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      return { status: 'aborted' };
    }
    const message = error instanceof Error ? error.message : BAMBU_IDENTIFY_FAILED_MESSAGE;
    if (serialNumber) {
      return {
        status: 'mqtt-failed',
        identity: {
          ...buildKnownIdentity({
            ipAddress,
            mqttPort: String(mqttPort),
            serialNumber,
            identity,
          }),
          mqttPort,
        },
        message,
      };
    }
    return {
      status: 'identify-failed',
      message,
      identity,
    };
  }
}
