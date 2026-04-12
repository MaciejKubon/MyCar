/**
 * Ekran Debugowania — ręczne testowanie bajtów komend.
 * Pozwala eksperymentalnie odkrywać protokół CaDA.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BleStatusBar from '../components/StatusBar';
import { broadcastCommand, stopBroadcast, initAdvertiser, getState } from '../services/BleAdvertiser';
import { addScanListener, ScannedDevice } from '../services/BleScanner';
import { TEST_PATTERNS, bytesToHex, hexToBytes, BLE_CONSTANTS, SavedCommand } from '../utils/commands';

interface HistoryEntry {
  id: string;
  bytes: number[];
  hex: string;
  timestamp: number;
  success: boolean;
  note: string;
}

const DebugScreen: React.FC = () => {
  const [hexInput, setHexInput] = useState('00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [btState, setBtState] = useState('PoweredOn');
  const [lastCmd, setLastCmd] = useState('');
  const [repeatInterval, setRepeatInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [isRepeating, setIsRepeating] = useState(false);
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([]);
  const [activeTab, setActiveTab] = useState<'send' | 'patterns' | 'saved' | 'logs'>('send');
  const [scannedLogs, setScannedLogs] = useState<ScannedDevice[]>([]);

  // Inicjalizacja
  React.useEffect(() => {
    initAdvertiser().then(ok => {
      setBtState(ok ? 'PoweredOn' : 'Error');
    });

    const removeScanner = addScanListener((device) => {
      setScannedLogs(prev => {
        // Dodaj nowy log na początek i przytnij do 30
        return [device, ...prev.filter(d => d.id !== device.id)].slice(0, 30);
      });
    });

    return () => {
      if (repeatInterval) clearInterval(repeatInterval);
      removeScanner();
    };
  }, []);

  const sendCurrentInput = useCallback(async () => {
    const bytes = hexToBytes(hexInput);
    if (bytes.length === 0) {
      Alert.alert('Błąd', 'Wpisz prawidłowe bajty hex');
      return;
    }

    // Pad do 16 bajtów
    while (bytes.length < BLE_CONSTANTS.DEFAULT_PACKET_LENGTH) {
      bytes.push(0);
    }

    const ok = await broadcastCommand(bytes);
    const hex = bytesToHex(bytes);
    
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      bytes: bytes.slice(0, 16),
      hex,
      timestamp: Date.now(),
      success: ok,
      note: '',
    };

    setHistory(prev => [entry, ...prev].slice(0, 100)); // Max 100 wpisów
    setLastCmd(hex);
  }, [hexInput]);

  const sendPattern = useCallback(async (bytes: number[]) => {
    const ok = await broadcastCommand(bytes);
    const hex = bytesToHex(bytes);
    setHexInput(hex);
    setLastCmd(hex);

    const entry: HistoryEntry = {
      id: Date.now().toString(),
      bytes: [...bytes],
      hex,
      timestamp: Date.now(),
      success: ok,
      note: '',
    };
    setHistory(prev => [entry, ...prev].slice(0, 100));
  }, []);

  const toggleRepeat = useCallback(() => {
    if (isRepeating) {
      if (repeatInterval) clearInterval(repeatInterval);
      setRepeatInterval(null);
      setIsRepeating(false);
      stopBroadcast();
    } else {
      setIsRepeating(true);
      // Wyślij natychmiast
      sendCurrentInput();
      // Powtarzaj co 150ms
      const interval = setInterval(() => {
        sendCurrentInput();
      }, 150);
      setRepeatInterval(interval);
    }
  }, [isRepeating, repeatInterval, sendCurrentInput]);

  const stopAll = useCallback(async () => {
    if (repeatInterval) clearInterval(repeatInterval);
    setRepeatInterval(null);
    setIsRepeating(false);
    await stopBroadcast();
    setLastCmd('STOPPED');
  }, [repeatInterval]);

  const saveCommand = useCallback((entry: HistoryEntry) => {
    const name = `CMD-${savedCommands.length + 1}`;
    setSavedCommands(prev => [...prev, {
      name,
      bytes: entry.bytes,
      notes: entry.hex,
      timestamp: Date.now(),
      works: true,
    }]);
    Alert.alert('Zapisano ✓', `Komenda zapisana jako "${name}"`);
  }, [savedCommands.length]);

  const setByteAt = useCallback((index: number, value: string) => {
    const bytes = hexToBytes(hexInput);
    while (bytes.length < 16) bytes.push(0);
    const val = parseInt(value, 16);
    if (!isNaN(val)) {
      bytes[index] = val & 0xFF;
    }
    setHexInput(bytesToHex(bytes));
  }, [hexInput]);

  const renderSendTab = () => (
    <ScrollView style={styles.tabContent}>
      {/* Hex input */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📝 Bajty do wysłania (hex)</Text>
        <TextInput
          style={styles.hexInput}
          value={hexInput}
          onChangeText={setHexInput}
          placeholder="00 01 02 03 ..."
          placeholderTextColor="#444"
          autoCapitalize="none"
          autoCorrect={false}
          multiline={false}
        />

        {/* Siatka bajtów */}
        <View style={styles.byteGrid}>
          {Array.from({ length: 16 }, (_, i) => {
            const bytes = hexToBytes(hexInput);
            while (bytes.length < 16) bytes.push(0);
            const val = bytes[i] ?? 0;
            return (
              <View key={i} style={styles.byteCell}>
                <Text style={styles.byteLabel}>[{i}]</Text>
                <TextInput
                  style={styles.byteInput}
                  value={val.toString(16).padStart(2, '0')}
                  onChangeText={(v) => setByteAt(i, v)}
                  maxLength={2}
                  autoCapitalize="none"
                  selectTextOnFocus
                />
                <Text style={styles.byteDec}>{val}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Przyciski akcji */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.sendBtn} onPress={sendCurrentInput}>
          <Text style={styles.sendBtnText}>📡 Wyślij raz</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.repeatBtn, isRepeating && styles.repeatBtnActive]}
          onPress={toggleRepeat}
        >
          <Text style={styles.sendBtnText}>
            {isRepeating ? '⏹ Stop repeat' : '🔄 Powtarzaj'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.stopBtn} onPress={stopAll}>
        <Text style={styles.stopBtnText}>🛑 STOP WSZYSTKO</Text>
      </TouchableOpacity>

      {/* Szybkie wartości */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Szybkie wartości dla byte[0]</Text>
        <View style={styles.quickRow}>
          {[0x00, 0x01, 0x02, 0x03, 0x04, 0x10, 0x20, 0xFF].map(val => (
            <TouchableOpacity
              key={val}
              style={styles.quickBtn}
              onPress={() => {
                const bytes = hexToBytes(hexInput);
                while (bytes.length < 16) bytes.push(0);
                bytes[0] = val;
                setHexInput(bytesToHex(bytes));
              }}
            >
              <Text style={styles.quickBtnText}>
                {val.toString(16).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Historia */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Historia ({history.length})</Text>
        {history.slice(0, 20).map((entry) => (
          <TouchableOpacity
            key={entry.id}
            style={styles.historyItem}
            onPress={() => setHexInput(entry.hex)}
            onLongPress={() => saveCommand(entry)}
          >
            <View style={styles.historyHeader}>
              <Text style={[styles.historyStatus, { color: entry.success ? '#4CAF50' : '#FF5252' }]}>
                {entry.success ? '✓' : '✗'}
              </Text>
              <Text style={styles.historyTime}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={styles.historyHex}>{entry.hex}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderPatternsTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🧪 Wzorce testowe (hipotezy)</Text>
        <Text style={styles.sectionHint}>
          Naciśnij aby wysłać. Te wzorce to hipotezy — testuj je z włączonym autkiem!
        </Text>
      </View>

      {TEST_PATTERNS.map((pattern, i) => (
        <TouchableOpacity
          key={i}
          style={styles.patternCard}
          onPress={() => sendPattern(pattern.bytes)}
        >
          <View style={styles.patternHeader}>
            <Text style={styles.patternIcon}>{pattern.icon}</Text>
            <View style={styles.patternInfo}>
              <Text style={styles.patternLabel}>{pattern.label}</Text>
              <Text style={styles.patternDesc}>{pattern.description}</Text>
            </View>
          </View>
          <Text style={styles.patternHex}>
            {bytesToHex(pattern.bytes)}
          </Text>
        </TouchableOpacity>
      ))}

      <View style={[styles.section, { marginTop: 20 }]}>
        <Text style={styles.sectionTitle}>ℹ️ Wskazówki</Text>
        <Text style={styles.hintText}>
          • Włącz autko i trzymaj blisko telefonu (~1m){'\n'}
          • Naciśnij wzorzec i obserwuj reakcję{'\n'}
          • Jeśli coś zadziała — przytrzymaj w Historii aby zapisać{'\n'}
          • Próbuj zmieniać pojedyncze bajty{'\n'}
          • MFG ID: 0xC200 (49664) — ustawione automatycznie{'\n'}
          • Długość pakietu: 16 bajtów
        </Text>
      </View>
    </ScrollView>
  );

  const renderSavedTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💾 Zapisane komendy</Text>
        {savedCommands.length === 0 && (
          <Text style={styles.emptyText}>
            Przytrzymaj komendę w historii aby ją zapisać
          </Text>
        )}
      </View>

      {savedCommands.map((cmd, i) => (
        <TouchableOpacity
          key={i}
          style={styles.savedCard}
          onPress={() => sendPattern(cmd.bytes)}
        >
          <Text style={styles.savedName}>{cmd.name}</Text>
          <Text style={styles.savedHex}>{bytesToHex(cmd.bytes)}</Text>
          {cmd.notes && <Text style={styles.savedNotes}>{cmd.notes}</Text>}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderLogsTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📡 Śledzenie na żywo (Raw Bytes)</Text>
        <Text style={styles.sectionHint}>
          Podgląd surowych bajtów rozsiewanych w powietrzu przez okoliczne urządzenia.
          Narzędzie do diagnozy CaDA i nie tylko!
        </Text>
      </View>

      {scannedLogs.map((log, i) => (
        <View key={log.id} style={styles.logCard}>
          <View style={styles.logHeader}>
            <Text style={styles.logName}>{log.name || 'Nieznane'}</Text>
            <Text style={styles.logMac}>{log.id}</Text>
          </View>
          <Text style={styles.logTime}>
            RSSI: {log.rssi} | Złapano: {new Date(log.timestamp).toLocaleTimeString()}
          </Text>
          
          {log.rawHex ? (
            <View style={styles.logPayloadBox}>
              <Text style={styles.logPayloadTitle}>Manufacturer Data (Hex):</Text>
              <Text style={styles.logPayload}>{log.rawHex}</Text>
            </View>
          ) : (
            <Text style={styles.logEmpty}>Brak danych rozgłoszeniowych</Text>
          )}

          {log.isCaDA && (
            <Text style={styles.logCadaBadge}>🚗 Podejrzany: Typ {log.type}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <BleStatusBar
        bluetoothState={btState}
        isBroadcasting={getState().isBroadcasting}
        lastCommand={lastCmd}
      />

      {/* Taby */}
      <View style={styles.tabs}>
        {(['send', 'patterns', 'saved', 'logs'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'send' ? '📝' : tab === 'patterns' ? '🧪' : tab === 'saved' ? '💾' : '📡 Logs'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'send' && renderSendTab()}
      {activeTab === 'patterns' && renderPatternsTab()}
      {activeTab === 'saved' && renderSavedTab()}
      {activeTab === 'logs' && renderLogsTab()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#6C63FF',
  },
  tabText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#9B95FF',
  },
  tabContent: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionHint: {
    color: '#555',
    fontSize: 12,
    lineHeight: 18,
  },
  hexInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#4FC3F7',
    fontFamily: 'monospace',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  byteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 4,
  },
  byteCell: {
    width: '11.5%',
    alignItems: 'center',
  },
  byteLabel: {
    color: '#444',
    fontSize: 8,
    fontFamily: 'monospace',
  },
  byteInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    width: '100%',
    height: 32,
    textAlign: 'center',
    color: '#4FC3F7',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  byteDec: {
    color: '#333',
    fontSize: 7,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  sendBtn: {
    flex: 1,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.4)',
  },
  repeatBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  repeatBtnActive: {
    backgroundColor: 'rgba(255, 60, 60, 0.2)',
    borderColor: 'rgba(255, 60, 60, 0.4)',
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stopBtn: {
    margin: 16,
    backgroundColor: 'rgba(255, 60, 60, 0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 60, 60, 0.3)',
  },
  stopBtnText: {
    color: '#FF5252',
    fontSize: 16,
    fontWeight: '700',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  quickBtnText: {
    color: '#4FC3F7',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '600',
  },
  historyItem: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyStatus: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyTime: {
    color: '#444',
    fontSize: 10,
  },
  historyHex: {
    color: '#4FC3F7',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  patternCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  patternHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  patternIcon: {
    fontSize: 28,
  },
  patternInfo: {
    flex: 1,
  },
  patternLabel: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '600',
  },
  patternDesc: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  patternHex: {
    color: '#4FC3F7',
    fontFamily: 'monospace',
    fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 8,
    borderRadius: 8,
  },
  savedCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.06)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.2)',
  },
  savedName: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  savedHex: {
    color: '#4FC3F7',
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: 4,
  },
  savedNotes: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  emptyText: {
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
  hintText: {
    color: '#555',
    fontSize: 12,
    lineHeight: 22,
  },
  logCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logName: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600',
  },
  logMac: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  logTime: {
    color: '#888',
    fontSize: 10,
    marginBottom: 8,
  },
  logPayloadBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  logPayloadTitle: {
    color: '#555',
    fontSize: 9,
    marginBottom: 4,
  },
  logPayload: {
    color: '#b39ddb',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  logEmpty: {
    color: '#444',
    fontSize: 11,
    fontStyle: 'italic',
  },
  logCadaBadge: {
    color: '#6C63FF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
});

export default DebugScreen;
