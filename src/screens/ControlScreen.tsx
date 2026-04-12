/**
 * Ekran Sterowania — D-Pad (Replay Attack) dla modelu PC (0xFFF0).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BleStatusBar from '../components/StatusBar';
import { broadcastCommand, sendStop, initAdvertiser, getState } from '../services/BleAdvertiser';
import { useCaDAConnection } from '../services/BleScanner';
import { CADA_PC_COMMANDS, BLE_CONSTANTS } from '../utils/commands';

const ControlScreen: React.FC<any> = ({ navigation }) => {
  const [status, setStatus] = useState('Inicjalizacja...');
  const [btState, setBtState] = useState('Unknown');
  const [lastCmd, setLastCmd] = useState('');
  const [activeBtn, setActiveBtn] = useState<string | null>(null);
  const isConnected = useCaDAConnection();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCommandRef = useRef<number[] | null>(null);
  
  // Bezpieczne marginesy dla wcięć ekranu (notch, pasek nawigacyjny)
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const ok = await initAdvertiser();
      if (ok) {
        setStatus('Gotowy — Tryb Replay PC');
        setBtState('PoweredOn');
      } else {
        setStatus('Błąd inicjalizacji BLE');
        setBtState('Error');
      }
    })();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const sendDirectCommand = useCallback(async (cmdArray: number[], label: string) => {
    activeCommandRef.current = cmdArray;
    setActiveBtn(label);
    
    // Nadaj od razu, szybka reakcja
    const ok = await broadcastCommand(cmdArray, true);
    if (ok) {
      setLastCmd(label);
      setStatus(`Włączono napęd: ${label}`);
    }

    // Odnów interwał podtrzymywania komendy
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      if (activeCommandRef.current) {
        broadcastCommand(activeCommandRef.current);
      }
    }, BLE_CONSTANTS.MIN_INTERVAL_MS);
  }, []);

  const handleStop = useCallback(async () => {
    activeCommandRef.current = null;
    setActiveBtn(null);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    await sendStop(); 
    setStatus('Oczekuję (IDLE)');
    setLastCmd('STOP');
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <BleStatusBar
        bluetoothState={btState}
        isBroadcasting={getState().isBroadcasting}
        lastCommand={lastCmd}
        isConnected={isConnected}
      />

      <View style={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity 
            style={styles.backBtn}
            onPress={() => navigation.navigate('Welcome')}
          >
            <Text style={styles.backBtnText}>◀ Powrót do Garażu</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.subtitle}>Sklonowane polecenia dla 0xFFF0</Text>
        </View>

        <View style={styles.dpadWrapper}>
          <View style={styles.dpadInnerGlow}>
            {/* Przycisk Przód */}
            <TouchableOpacity
              style={[styles.dpadBtn, styles.dpadUp, activeBtn === 'PRZÓD' && styles.dpadActive]}
              onPressIn={() => sendDirectCommand(CADA_PC_COMMANDS.FWD, 'PRZÓD')}
              onPressOut={handleStop}
              activeOpacity={0.8}
            >
              <Text style={[styles.dpadIcon, activeBtn === 'PRZÓD' && styles.dpadIconActive]}>▲</Text>
            </TouchableOpacity>

            <View style={styles.dpadRow}>
              {/* Przycisk Lewo */}
              <TouchableOpacity
                style={[styles.dpadBtn, styles.dpadSide, activeBtn === 'LEWO' && styles.dpadActive]}
                onPressIn={() => sendDirectCommand(CADA_PC_COMMANDS.LEFT, 'LEWO')}
                onPressOut={handleStop}
                activeOpacity={0.8}
              >
                <Text style={[styles.dpadIcon, activeBtn === 'LEWO' && styles.dpadIconActive]}>◀</Text>
              </TouchableOpacity>

              {/* Przycisk STOP (Center) */}
              <View style={styles.dpadCenter}>
                <View style={styles.dpadCenterDot} />
              </View>

              {/* Przycisk Prawo */}
              <TouchableOpacity
                style={[styles.dpadBtn, styles.dpadSide, activeBtn === 'PRAWO' && styles.dpadActive]}
                onPressIn={() => sendDirectCommand(CADA_PC_COMMANDS.RIGHT, 'PRAWO')}
                onPressOut={handleStop}
                activeOpacity={0.8}
              >
                <Text style={[styles.dpadIcon, activeBtn === 'PRAWO' && styles.dpadIconActive]}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Przycisk Tył */}
            <TouchableOpacity
              style={[styles.dpadBtn, styles.dpadDown, activeBtn === 'TYŁ' && styles.dpadActive]}
              onPressIn={() => sendDirectCommand(CADA_PC_COMMANDS.REV, 'TYŁ')}
              onPressOut={handleStop}
              activeOpacity={0.8}
            >
              <Text style={[styles.dpadIcon, activeBtn === 'TYŁ' && styles.dpadIconActive]}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0a0a14',
  },
  content: { 
    flex: 1, 
    justifyContent: 'space-between',
    alignItems: 'center', 
    paddingTop: 10,
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'flex-start',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backBtnText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
  },
  status: { 
    color: '#00FA9A', 
    fontSize: 16, 
    fontWeight: '800', 
    letterSpacing: 1,
    marginBottom: 6,
    textShadowColor: 'rgba(0, 250, 154, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  subtitle: { 
    color: '#666', 
    fontSize: 12, 
    letterSpacing: 1,
  },
  dpadWrapper: {
    padding: 20,
    backgroundColor: 'rgba(20, 20, 35, 0.5)',
    borderRadius: 150,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  dpadInnerGlow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginVertical: 4 
  },
  dpadBtn: {
    width: 80, 
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(30, 30, 45, 0.8)',
    justifyContent: 'center', 
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  dpadActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.4)',
    borderColor: 'rgba(108, 99, 255, 0.8)',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  dpadUp: { marginBottom: 4 },
  dpadDown: { marginTop: 4 },
  dpadSide: {},
  dpadCenter: { 
    width: 80, 
    height: 80, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  dpadCenterDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  dpadIcon: { 
    color: '#888', 
    fontSize: 32,
    fontWeight: '900',
  },
  dpadIconActive: {
    color: '#fff',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});

export default ControlScreen;
