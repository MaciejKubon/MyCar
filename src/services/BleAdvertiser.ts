/**
 * Warstwa BLE Advertising — wysyłanie komend do urządzenia CaDA.
 * 
 * Komunikacja odbywa się przez BLE Advertising (bezpołączeniowo):
 * 1. Budujemy tablicę bajtów (komendę)
 * 2. Nadajemy ją jako Manufacturer Specific Data z ID 0xC200
 * 3. Urządzenie nasłuchuje i reaguje
 * 
 * Parametry z reverse-engineeringu:
 *   AdvertiseMode: LOW_LATENCY (2)
 *   TxPowerLevel: HIGH (3)
 *   Connectable: true (oryginał), false (nasza apka — nie chcemy połączeń)
 *   Timeout: 0 (bez limitu)
 *   IncludeDeviceName: false
 *   Min interval: 100ms
 */

import BLEAdvertiser from 'react-native-ble-advertiser';
import { BLE_CONSTANTS, CADA_PC_COMMANDS } from '../utils/commands';

// Stan modułu
let isInitialized = false;
let isBroadcasting = false;
let lastBroadcastTime = 0;

/**
 * Inicjalizacja modułu BLE Advertiser.
 * Ustawia Manufacturer ID na 0xC200 (49664).
 */
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

/**
 * Nadaje komendę jako BLE Advertisement.
 * 
 * @param bytes - Tablica bajtów do wysłania
 * @param force - Czy ominąć lokalną blokadę częstotliwości (domyślnie false)
 * @returns true jeśli nadawanie wystartowało
 */
export async function broadcastCommand(bytes: number[], force = false): Promise<boolean> {
  if (!isInitialized) {
    console.warn('[BleAdvertiser] Not initialized');
    return false;
  }

  // Rate limiting — min 100ms między pakietami
  const now = Date.now();
  if (!force && now - lastBroadcastTime < BLE_CONSTANTS.MIN_INTERVAL_MS) {
    return false;
  }

  try {
    // Zatrzymaj poprzednie nadawanie
    if (isBroadcasting) {
      try {
        await BLEAdvertiser.stopBroadcast();
      } catch (e) {
        // Ignoruj jeśli wcześniej nic nie nadawano
      }
    }

    // Zapewnij prawidłową długość zależnie od payloadu (wsparcie 16 lub 24 bajtów)
    const data = [...bytes];

    // Nadawaj jako BLE Advertisement z MFG ID 0xC200
    await BLEAdvertiser.broadcast('', data, {
      advertiseMode: BLE_CONSTANTS.ADVERTISE_MODE,      // LOW_LATENCY
      txPowerLevel: BLE_CONSTANTS.TX_POWER_LEVEL,       // HIGH
      connectable: true,                                 // Jak w oryginale
      includeDeviceName: false,                          // Jak w oryginale
    });

    isBroadcasting = true;
    lastBroadcastTime = now;
    return true;
  } catch (error) {
    console.error('[BleAdvertiser] Broadcast error:', error);
    return false;
  }
}

/**
 * Zatrzymuje nadawanie BLE.
 */
export async function stopBroadcast(): Promise<void> {
  try {
    await BLEAdvertiser.stopBroadcast();
    isBroadcasting = false;
  } catch (error) {
    // Ignoruj — mogło nie być aktywnego nadawania
  }
}

/**
 * Nadaje komendę STOP (pakiet IDLE/STOP z PC) ignorując rate limiting i po 250ms wyłącza nadajnik.
 */
export async function sendStop(): Promise<void> {
  const stopBytes = Array.from(CADA_PC_COMMANDS.STOP);
  
  // Wymuś natychmiastowe nadanie STOP
  await broadcastCommand(stopBytes, true);

  // Wyślij asekuracyjnie po 100ms w razie zgubienia z eteru
  setTimeout(async () => {
    await broadcastCommand(stopBytes, true);
  }, 100);

  // Wyłącz nadajnik by oszczędzać baterię
  setTimeout(async () => {
    await stopBroadcast();
  }, 250);
}

/**
 * Zwraca stan modułu.
 */
export function getState() {
  return {
    isInitialized,
    isBroadcasting,
    lastBroadcastTime,
  };
}
