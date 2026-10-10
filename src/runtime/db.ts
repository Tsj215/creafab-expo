import * as SQLite from 'expo-sqlite';

import { compareIpv4 } from '@/src/runtime/net';
import { DeviceRecord } from '@/src/runtime/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  driver TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_number TEXT NOT NULL DEFAULT '',
  mac TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL,
  http_port INTEGER NOT NULL,
  ws_port INTEGER NOT NULL,
  access_code TEXT NOT NULL DEFAULT '',
  mqtt_port INTEGER NOT NULL DEFAULT 8883,
  firmware TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_devices_serial
  ON devices(driver, serial_number) WHERE serial_number <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uidx_devices_mac
  ON devices(driver, mac) WHERE mac <> '';
`;

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase() {
  if (!opening) {
    opening = SQLite.openDatabaseAsync('creafab.db')
      .then(async (opened) => {
        await opened.execAsync('PRAGMA journal_mode = WAL').catch(() => undefined);
        await opened.execAsync(SCHEMA);
        await opened.execAsync('ALTER TABLE devices ADD COLUMN access_code TEXT NOT NULL DEFAULT \'\'').catch(() => undefined);
        await opened.execAsync('ALTER TABLE devices ADD COLUMN mqtt_port INTEGER NOT NULL DEFAULT 8883').catch(() => undefined);
        return opened;
      })
      .catch((error: unknown) => {
        opening = null;
        throw error;
      });
  }
  return opening;
}

type DeviceRow = {
  id: string;
  name: string;
  sort_order: number;
  driver: string;
  model: string;
  serial_number: string;
  mac: string;
  ip_address: string;
  http_port: number;
  ws_port: number;
  access_code?: string;
  mqtt_port?: number;
  firmware: string;
  created_at: string;
  updated_at: string;
};

function toRecord(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    driver: row.driver === 'bambu' ? 'bambu' : 'creality',
    model: row.model,
    serialNumber: row.serial_number,
    mac: row.mac,
    ipAddress: row.ip_address,
    httpPort: row.http_port,
    wsPort: row.ws_port,
    accessCode: row.access_code ?? '',
    mqttPort: row.mqtt_port ?? 8883,
    firmware: row.firmware,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDevices() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DeviceRow>('SELECT * FROM devices ORDER BY sort_order ASC');
  return rows
    .filter((row) => row.driver === 'creality' || row.driver === 'bambu')
    .map(toRecord)
    .sort((left, right) => left.sortOrder - right.sortOrder || compareIpv4(left.ipAddress, right.ipAddress));
}

export async function persistDevice(device: DeviceRecord, removeIds: readonly string[]) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const id of removeIds) {
      await db.runAsync('DELETE FROM devices WHERE id = ?', id);
    }
    await db.runAsync(
      `INSERT INTO devices (
        id, name, sort_order, driver, model, serial_number, mac, ip_address, http_port, ws_port, access_code, mqtt_port, firmware, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        sort_order = excluded.sort_order,
        driver = excluded.driver,
        model = excluded.model,
        serial_number = excluded.serial_number,
        mac = excluded.mac,
        ip_address = excluded.ip_address,
        http_port = excluded.http_port,
        ws_port = excluded.ws_port,
        access_code = excluded.access_code,
        mqtt_port = excluded.mqtt_port,
        firmware = excluded.firmware,
        updated_at = excluded.updated_at`,
      device.id,
      device.name,
      device.sortOrder,
      device.driver,
      device.model,
      device.serialNumber,
      device.mac,
      device.ipAddress,
      device.httpPort,
      device.wsPort,
      device.accessCode,
      device.mqttPort,
      device.firmware,
      device.createdAt,
      device.updatedAt,
    );
  });
}

export async function deleteDevice(id: string) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM devices WHERE id = ?', id);
}
