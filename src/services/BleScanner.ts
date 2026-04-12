/**
 * Warstwa BLE Scanner — skanowanie urządzeń CaDA.
 * 
 * Urządzenia CaDA nadają pakiety reklamowe:
 * - MFG ID 0x11AA (4522) — urządzenia typu "HS" (nazwa zawiera "HSZ_HS")
 * - MFG ID 0xFFF0 (65520) — urządzenia typu "PC"
 * 
 * Parametry skanowania (z oryginału):
 *   Mode: Low Latency
 *   Auto-restart: co 2000ms
 *   Filtry: brak (skanuj wszystko)
 */

import { useState, useEffect } from 'react';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { BLE_CONSTANTS } from '../utils/commands';

/**
 * Hook do odczytu statusu wirtualnego połączenia z CaDA.
 */
export function useCaDAConnection(): boolean {
  const [isConnected, setIsConnected] = useState(false);
  useEffect(() => {
    const unsub = addConnectionListener(setIsConnected);
    return unsub;
  }, []);
  return isConnected;
}

// Singleton BleManager
let manager: BleManager | null = null;

export interface ScannedDevice {
  id: string;             // MAc adres (Android) lub UUID (iOS)
  name: string | null;    // null jeśli nie rozgłasza
  rssi: number | null;    // siła domyślna
  manufacturerData: string | null; // Base64 (surowe powitania)
  rawHex: string | null;  // Zdekodowany heks
  isCaDA: boolean;        // Wynik filtru algorytmu
  type: 'HS' | 'PC' | 'unknown'; // Typ autka CaDA
  timestamp: number;
}

type ScanCallback = (device: ScannedDevice) => void;

let scanCallbacks: ScanCallback[] = [];
let isScanning = false;

// Ostatnio widziane urządzenie CaDA
let lastCaDAScrubTime = 0;
let connectionListeners: ((isConnected: boolean) => void)[] = [];

/**
 * Podłącz nasłuch na wyniki skanera.
 */
export function addScanListener(callback: ScanCallback): () => void {
  scanCallbacks.push(callback);
  return () => {
    scanCallbacks = scanCallbacks.filter(c => c !== callback);
  };
}

/**
 * Podłącz nasłuch na wirtualny status połączenia.
 */
export function addConnectionListener(callback: (isConnected: boolean) => void): () => void {
  connectionListeners.push(callback);
  return () => {
    connectionListeners = connectionListeners.filter(c => c !== callback);
  };
}

/**
 * Background loop do sprawdzania timeoutu połączenia (3 sekundy)
 */
setInterval(() => {
  const isConnected = Date.now() - lastCaDAScrubTime < 3000;
  connectionListeners.forEach(cb => cb(isConnected));
}, 1000);

/**
 * Inicjalizacja managera BLE.
 */
export function initScanner(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

/**
 * Sprawdza stan Bluetooth.
 */
export async function checkBluetoothState(): Promise<State> {
  const mgr = initScanner();
  return mgr.state();
}

/**
 * Nasłuchuje na zmiany stanu Bluetooth.
 */
export function onStateChange(callback: (state: State) => void): { remove: () => void } {
  const mgr = initScanner();
  const subscription = mgr.onStateChange((state) => {
    callback(state);
  }, true);
  return subscription;
}

/**
 * Wyłącza ręczne wywołania startScan przez pojedyncze ekrany, promuje skaner globalny
 */
export function startGlobalScan(): void {
  const mgr = initScanner();
  if (isScanning) return; // Już skanuje
  isScanning = true;
  doScan(mgr);
}

/**
 * Wewnętrzna funkcja skanowania.
 */
function doScan(mgr: BleManager): void {
  mgr.startDeviceScan(
    null,  // Brak filtrów UUID (skanuj wszystko — jak w oryginale)
    {
      allowDuplicates: true,  // Pozwalaj na duplikaty (chcemy widzieć aktualizacje)
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

// Szybki dekoder base64 dla React Native (ponieważ atob jest niedostępne)
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

/**
 * Przetwarza znalezione urządzenie — identyfikuje typ CaDA.
 */
function processDevice(device: Device): ScannedDevice {
  const name = device.name || device.localName || null;
  let isCaDA = false;
  let type: 'HS' | 'PC' | 'unknown' = 'unknown';

  // Sprawdź czy nazwa zawiera filtry z różnych zabawek CaDA
  if (name && (name.includes(BLE_CONSTANTS.DEVICE_NAME_FILTER) || name.includes('CaDA'))) {
    isCaDA = true;
    type = 'HS';
  }

  // Sprawdź Manufacturer Data
  // react-native-ble-plx zwraca manufacturerData jako base64
  let rawHex: string | null = null;
  if (device.manufacturerData) {
    try {
      const bytes = decodeBase64ToBytes(device.manufacturerData);
      if (bytes.length > 0) {
        rawHex = bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0')).join(' ');
      }
      if (bytes.length >= 2) {
        // Pierwsze 2 bajty to Company ID (little-endian)
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
      // Ignoruj błędy parsowania
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

  // Logi wyłączone ze względu na wysoki spam w konsoli
  // const serviceUUIDs = device.serviceUUIDs ? device.serviceUUIDs.join(',') : 'none';
  // console.log(`[🚀 BLE] Name: ${name || 'N/A'} | MAC: ${device.id} | RSSI: ${device.rssi} | Hex: ${rawHex || 'NONE'} | Services: ${serviceUUIDs} | CaDA: ${isCaDA}`);

  return result;
}

/**
 * Zatrzymuje skanowanie.
 */
export function stopScan(): void {
  if (manager) {
    try {
      manager.stopDeviceScan();
    } catch (e) {
      // Ignoruj
    }
  }
  
  isScanning = false;
}

/**
 * Zwraca stan skanera.
 */
export function getScannerState() {
  return { isScanning };
}

/**
 * Niszczy managera (cleanup).
 */
export function destroyScanner(): void {
  stopScan();
  if (manager) {
    manager.destroy();
    manager = null;
  }
}
