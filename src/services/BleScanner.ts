import { useState, useEffect } from 'react';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { BLE_CONSTANTS } from '../utils/commands';

export function useCaDAConnection(): boolean {
  const [isConnected, setIsConnected] = useState(false);
  useEffect(() => {
    const unsub = addConnectionListener(setIsConnected);
    return unsub;
  }, []);
  return isConnected;
}

let manager: BleManager | null = null;

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  manufacturerData: string | null;
  rawHex: string | null;
  isCaDA: boolean;
  type: 'HS' | 'PC' | 'unknown';
  timestamp: number;
}

type ScanCallback = (device: ScannedDevice) => void;

let scanCallbacks: ScanCallback[] = [];
let isScanning = false;

let lastCaDAScrubTime = 0;
let connectionListeners: ((isConnected: boolean) => void)[] = [];

export function addScanListener(callback: ScanCallback): () => void {
  scanCallbacks.push(callback);
  return () => {
    scanCallbacks = scanCallbacks.filter(c => c !== callback);
  };
}

export function addConnectionListener(callback: (isConnected: boolean) => void): () => void {
  connectionListeners.push(callback);
  return () => {
    connectionListeners = connectionListeners.filter(c => c !== callback);
  };
}

setInterval(() => {
  const isConnected = Date.now() - lastCaDAScrubTime < 8000;
  connectionListeners.forEach(cb => cb(isConnected));
}, 1000);

export function initScanner(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

export async function checkBluetoothState(): Promise<State> {
  const mgr = initScanner();
  return mgr.state();
}

export function onStateChange(callback: (state: State) => void): { remove: () => void } {
  const mgr = initScanner();
  const subscription = mgr.onStateChange((state) => {
    callback(state);
  }, true);
  return subscription;
}

export function startGlobalScan(): void {
  const mgr = initScanner();
  if (isScanning) return;
  isScanning = true;
  doScan(mgr);
}

function doScan(mgr: BleManager): void {
  mgr.startDeviceScan(
    null,
    {
      allowDuplicates: true,
    },
    (error, device) => {
      if (error) {
        console.error('[BleScanner] Scan error:', error);
        return;
      }

      if (device) {
        const scanned = processDevice(device);
        if (scanned.isCaDA) {
          lastCaDAScrubTime = Date.now();
        }
        scanCallbacks.forEach(cb => cb(scanned));
      }
    }
  );
}

const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64Lookup = new Uint8Array(256);
for (let i = 0; i < b64chars.length; i++) b64Lookup[b64chars.charCodeAt(i)] = i;

function decodeBase64ToBytes(base64: string): number[] {
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === '=') bufferLength--;
  if (base64[base64.length - 2] === '=') bufferLength--;
  const bytes = new Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    let encoded1 = b64Lookup[base64.charCodeAt(i)];
    let encoded2 = b64Lookup[base64.charCodeAt(i + 1)];
    let encoded3 = b64Lookup[base64.charCodeAt(i + 2)];
    let encoded4 = b64Lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (base64.charCodeAt(i + 2) !== 61) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (base64.charCodeAt(i + 3) !== 61) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  return bytes;
}

function processDevice(device: Device): ScannedDevice {
  const name = device.name || device.localName || null;
  let isCaDA = false;
  let type: 'HS' | 'PC' | 'unknown' = 'unknown';

  if (name && (name.includes(BLE_CONSTANTS.DEVICE_NAME_FILTER) || name.includes('CaDA'))) {
    isCaDA = true;
    type = 'HS';
  }

  let rawHex: string | null = null;
  if (device.manufacturerData) {
    try {
      const bytes = decodeBase64ToBytes(device.manufacturerData);
      if (bytes.length > 0) {
        rawHex = bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0')).join(' ');
      }
      if (bytes.length >= 2) {
        const companyId = bytes[0] | (bytes[1] << 8);
        
        if (companyId === BLE_CONSTANTS.MANUFACTURER_ID_RECV_HS || companyId === BLE_CONSTANTS.MANUFACTURER_ID) {
          isCaDA = true;
          type = 'HS';
        } else if (companyId === BLE_CONSTANTS.MANUFACTURER_ID_RECV_PC) {
          isCaDA = true;
          type = 'PC';
        }
      }
    } catch (e) {
    }
  }

  const result: ScannedDevice = {
    id: device.id,
    name,
    rssi: device.rssi,
    manufacturerData: device.manufacturerData,
    rawHex,
    isCaDA,
    type,
    timestamp: Date.now(),
  };

  return result;
}

export function stopScan(): void {
  if (manager) {
    try {
      manager.stopDeviceScan();
    } catch (e) {
    }
  }
  
  isScanning = false;
}

export function getScannerState() {
  return { isScanning };
}

export function destroyScanner(): void {
  stopScan();
  if (manager) {
    manager.destroy();
    manager = null;
  }
}
