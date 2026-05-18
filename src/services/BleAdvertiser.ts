
import BLEAdvertiser from 'react-native-ble-advertiser';
import { BLE_CONSTANTS, CADA_PC_COMMANDS } from '../utils/commands';


let isInitialized = false;
let isBroadcasting = false;
let lastBroadcastTime = 0;

export async function initAdvertiser(): Promise<boolean> {
  try {
    BLEAdvertiser.setCompanyId(BLE_CONSTANTS.MANUFACTURER_ID);
    isInitialized = true;
    return true;
  } catch (error) {
    console.error('[BleAdvertiser] Init error:', error);
    return false;
  }
}

export async function broadcastCommand(bytes: number[], force = false): Promise<boolean> {
  if (!isInitialized) {
    console.warn('[BleAdvertiser] Not initialized');
    return false;
  }

  const now = Date.now();
  if (!force && now - lastBroadcastTime < BLE_CONSTANTS.MIN_INTERVAL_MS) {
    return false;
  }

  try {
    if (isBroadcasting) {
      try {
        await BLEAdvertiser.stopBroadcast();
      } catch (e) {
      }
    }

    const data = [...bytes];

    await BLEAdvertiser.broadcast('', data, {
      advertiseMode: BLE_CONSTANTS.ADVERTISE_MODE,
      txPowerLevel: BLE_CONSTANTS.TX_POWER_LEVEL,
      connectable: true,
      includeDeviceName: false,
    });

    isBroadcasting = true;
    lastBroadcastTime = now;
    return true;
  } catch (error) {
    console.error('[BleAdvertiser] Broadcast error:', error);
    return false;
  }
}

export async function stopBroadcast(): Promise<void> {
  try {
    await BLEAdvertiser.stopBroadcast();
    isBroadcasting = false;
  } catch (error) {
  }
}

export async function sendStop(): Promise<void> {
  const stopBytes = Array.from(CADA_PC_COMMANDS.STOP);
  
  await broadcastCommand(stopBytes, true);

  setTimeout(async () => {
    await broadcastCommand(stopBytes, true);
  }, 100);

  setTimeout(async () => {
    await stopBroadcast();
  }, 250);
}

export function getState() {
  return {
    isInitialized,
    isBroadcasting,
    lastBroadcastTime,
  };
}
