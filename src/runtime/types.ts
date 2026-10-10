export type DeviceDriver = 'creality' | 'bambu';

export type DeviceRecord = {
  id: string;
  name: string;
  sortOrder: number;
  driver: DeviceDriver;
  model: string;
  serialNumber: string;
  mac: string;
  ipAddress: string;
  httpPort: number;
  wsPort: number;
  /** 拓竹局域网访问码。创想设备留空。 */
  accessCode: string;
  /** 拓竹 MQTT 端口，默认 8883。 */
  mqttPort: number;
  firmware: string;
  createdAt: string;
  updatedAt: string;
};

export type CrealityInfo = {
  mac: string;
  model: string;
  serialNumber: string;
  firmware: string;
  hostname: string;
};

export type Candidate = {
  ipAddress: string;
  httpPort: number;
  info: CrealityInfo;
};

export type DiscoveryStatus = 'idle' | 'running' | 'completed' | 'stopped';

export type DiscoverySession = {
  status: DiscoveryStatus;
  subnet: string;
  completedCount: number;
  total: number;
  candidates: Candidate[];
  message: string;
};

export const CREALITY_WS_PORT = 9999;
export const CREALITY_CONNECT_TIMEOUT_MS = 6000;
export const CONNECT_CONCURRENCY = 2;
export const CREALITY_HTTP_PORT = 80;
export const BAMBU_MQTT_PORT = 8883;
export const BAMBU_AUTH_USERNAME = 'bblp';
export const MANUAL_PROBE_TIMEOUT_MS = 4500;
export const SCAN_PROBE_TIMEOUT_MS = 800;
export const SCAN_CONCURRENCY = 4;
