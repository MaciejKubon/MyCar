/**
 * Definicje komend sterujących CaDA.
 * 
 * UWAGA: Konkretne bajty komend nie są znane z dekompilacji
 * (są zaszyfrowane w libapp.so). Te definicje służą jako framework
 * do eksperymentalnego odkrywania protokołu.
 * 
 * Znane stałe:
 *   Manufacturer ID: 0xC200 (49664) — little-endian w pakiecie BLE
 *   Domyślna długość: 16 bajtów
 *   Min interwał: 100ms
 */

// Typ komendy sterującej
export interface CarCommand {
  name: string;
  label: string;
  icon: string;
  bytes: number[];        // 16 bajtów do wysłania
  description?: string;
  discovered?: boolean;   // czy komenda została potwierdzona eksperymentalnie
}

// Znane stałe protokołu
export const BLE_CONSTANTS = {
  MANUFACTURER_ID: 49664,        // 0xC200
  MANUFACTURER_ID_RECV_HS: 4522, // 0x11AA
  MANUFACTURER_ID_RECV_PC: 65520,// 0xFFF0
  DEVICE_NAME_FILTER: 'HSZ_HS',
  DEFAULT_PACKET_LENGTH: 16,
  MIN_INTERVAL_MS: 100,
  SCAN_RESTART_MS: 2000,
  ADVERTISE_MODE: 2,             // LOW_LATENCY
  TX_POWER_LEVEL: 3,             // HIGH
};

// Bajty wyciągnięte z HCI logu (zaszyfrowane — prefix sesji)
export const HCI_SESSION_PREFIX = [
  0xEE, 0x1B, 0xC8, 0xAF, 0x9F, 0x3C, 0xCD
];

// ======================================================================
// KOMENDY DO ODKRYCIA EKSPERYMENTALNIE
// ======================================================================

// Hipotezy na podstawie logiki innych zabawek RC BLE:
// Typowy format: [header, speed_L, speed_R, lights, sound, 0, 0, ..., checksum]

/**
 * Generuje prostą komendę 16-bajtową.
 * Format hipotetyczny (do weryfikacji eksperymentalnej):
 *   byte[0]: typ komendy (0x01=ruch, 0x02=światła, 0x03=dźwięk)
 *   byte[1]: wartość 1 (np. prędkość lewy silnik, -128..127)
 *   byte[2]: wartość 2 (np. prędkość prawy silnik)
 *   byte[3-14]: padding (0x00)
 *   byte[15]: checksum (XOR lub suma)
 */
export function buildCommand(bytes: number[]): number[] {
  const cmd = new Array(BLE_CONSTANTS.DEFAULT_PACKET_LENGTH).fill(0);
  for (let i = 0; i < Math.min(bytes.length, cmd.length); i++) {
    cmd[i] = bytes[i] & 0xFF;
  }
  return cmd;
}

/**
 * Oblicza sumę kontrolną (XOR) — jedna z możliwych metod.
 */
export function checksumXOR(bytes: number[]): number {
  let xor = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    xor ^= bytes[i];
  }
  return xor & 0xFF;
}

/**
 * Oblicza sumę kontrolną (ADD mod 256) — druga możliwa metoda.
 */
export function checksumADD(bytes: number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    sum += bytes[i];
  }
  return sum & 0xFF;
}

/**
 * Konwertuje bajty na hex string.
 */
export function bytesToHex(bytes: number[]): string {
  return bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0')).join(' ');
}

/**
 * Parsuje hex string na tablicę bajtów.
 */
export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substr(i, 2), 16));
  }
  return bytes;
}

// Predefiniowane wzorce do testowania (hipotezy)
export const TEST_PATTERNS: CarCommand[] = [
  {
    name: 'stop',
    label: 'STOP',
    icon: '⏹️',
    bytes: buildCommand([0x00, 0x00, 0x00, 0x00]),
    description: 'Wszystkie zera — test STOP',
  },
  {
    name: 'forward_slow',
    label: 'Przód (wolno)',
    icon: '⬆️',
    bytes: buildCommand([0x01, 0x32, 0x32, 0x00]),
    description: 'Hipoteza: cmd=1, speed=50, speed=50',
  },
  {
    name: 'forward_fast',
    label: 'Przód (szybko)',
    icon: '⏫',
    bytes: buildCommand([0x01, 0x64, 0x64, 0x00]),
    description: 'Hipoteza: cmd=1, speed=100, speed=100',
  },
  {
    name: 'backward_slow',
    label: 'Tył (wolno)',
    icon: '⬇️',
    bytes: buildCommand([0x02, 0x32, 0x32, 0x00]),
    description: 'Hipoteza: cmd=2, speed=50',
  },
  {
    name: 'left',
    label: 'Lewo',
    icon: '⬅️',
    bytes: buildCommand([0x03, 0x64, 0x00, 0x00]),
    description: 'Hipoteza: cmd=3, speed=100',
  },
  {
    name: 'right',
    label: 'Prawo',
    icon: '➡️',
    bytes: buildCommand([0x04, 0x64, 0x00, 0x00]),
    description: 'Hipoteza: cmd=4, speed=100',
  },
  {
    name: 'light_on',
    label: 'Światła ON',
    icon: '💡',
    bytes: buildCommand([0x10, 0x01, 0x00, 0x00]),
    description: 'Hipoteza: cmd=16, on=1',
  },
  {
    name: 'light_off',
    label: 'Światła OFF',
    icon: '🔅',
    bytes: buildCommand([0x10, 0x00, 0x00, 0x00]),
    description: 'Hipoteza: cmd=16, on=0',
  },
  // Wzorce z prawdziwego HCI logu (zaszyfrowane, ale motże autko je rozpozna)
  {
    name: 'hci_idle',
    label: 'HCI: Idle',
    icon: '📡',
    bytes: [0xEE, 0x1B, 0xC8, 0xAF, 0x9F, 0x3C, 0xCD, 0x42, 0x2C, 0xE3, 0x74, 0xCA, 0x6B, 0xFF, 0x42, 0xDA],
    description: 'Prefix z HCI logu (najczęstsza komenda)',
  },
];

// Zapisane komendy (odkryte eksperymentalnie)
export interface SavedCommand {
  name: string;
  bytes: number[];
  notes: string;
  timestamp: number;
  works: boolean;
}

// Skatalogowane pakiety do ataku Replay (model PC / 0xFFF0)
export const CADA_PC_COMMANDS = {
  STOP:  [0xee, 0x1b, 0xc8, 0xaf, 0x9f, 0x3c, 0xcd, 0x42, 0x2c, 0xe3, 0x74, 0xca, 0x6b, 0xff, 0x42, 0xda, 0x07, 0x23, 0x00, 0x3b, 0xc7, 0xb6, 0x62, 0x48],
  
  // Dawniej "prawy" (0x08 0x23) -> fizycznie okazało się, że to jazda w Przód
  FWD:   [0xee, 0x1b, 0xc8, 0xaf, 0x9f, 0x3c, 0xcd, 0x42, 0x2c, 0xe3, 0x74, 0xca, 0x6b, 0xff, 0x42, 0xda, 0x08, 0x23, 0x00, 0x3b, 0xc7, 0xb6, 0xeb, 0x75],
  
  // Dawniej "lewy" (0xeb 0x23) -> fizycznie okazało się, że to jazda w Tył
  REV:   [0xee, 0x1b, 0xc8, 0xaf, 0x9f, 0x3c, 0xcd, 0x42, 0x2c, 0xe3, 0x74, 0xca, 0x6b, 0xff, 0x42, 0xda, 0xeb, 0x23, 0x00, 0x3b, 0xc7, 0xb6, 0x85, 0xfb],
  
  // Dawniej "górny" (0x07 0x2c) -> fizycznie okazało się, że to skręt w Lewo
  LEFT:  [0xee, 0x1b, 0xc8, 0xaf, 0x9f, 0x3c, 0xcd, 0x42, 0x2c, 0xe3, 0x74, 0xca, 0x6b, 0xff, 0x42, 0xda, 0x07, 0x2c, 0x00, 0x3b, 0xc7, 0xb6, 0x9e, 0x22],
  
  // Dawniej "dolny" (0x07 0xcf) -> fizycznie okazało się, że to skręt w Prawo
  RIGHT: [0xee, 0x1b, 0xc8, 0xaf, 0x9f, 0x3c, 0xcd, 0x42, 0x2c, 0xe3, 0x74, 0xca, 0x6b, 0xff, 0x42, 0xda, 0x07, 0xcf, 0x00, 0x3b, 0xc7, 0xb6, 0xb4, 0x14],
  
  LIGHTS:[0xee, 0x1b, 0xc8, 0xaf, 0x9f, 0x3c, 0xcd, 0x42, 0x2c, 0xe3, 0x74, 0xca, 0x6b, 0xff, 0x42, 0xda, 0x07, 0x73, 0x00, 0x3b, 0xc7, 0xb6, 0x00, 0x3d]
};
