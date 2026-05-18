
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BleStatusBar from '../components/StatusBar';
import { broadcastCommand, sendStop, initAdvertiser, getState } from '../services/BleAdvertiser';
import { useCaDAConnection } from '../services/BleScanner';
import { CADA_PC_COMMANDS } from '../utils/commands';
import { useTranslation } from 'react-i18next';

type DirKey = 'FWD' | 'REV' | 'LEFT' | 'RIGHT' | 'FWD_LEFT' | 'FWD_RIGHT' | 'REV_LEFT' | 'REV_RIGHT';

const DIR_CMD: Record<DirKey, number[]> = {
  'FWD':       CADA_PC_COMMANDS.FWD,
  'REV':         CADA_PC_COMMANDS.REV,
  'LEFT':         CADA_PC_COMMANDS.LEFT,
  'RIGHT':        CADA_PC_COMMANDS.RIGHT,
  'FWD_LEFT':  CADA_PC_COMMANDS.FWD_LEFT,
  'FWD_RIGHT': CADA_PC_COMMANDS.FWD_RIGHT,
  'REV_LEFT':    CADA_PC_COMMANDS.REV_LEFT,
  'REV_RIGHT':   CADA_PC_COMMANDS.REV_RIGHT,
};

const ControlScreen: React.FC<any> = ({ navigation }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState(t('control.initializing'));
  const [btState, setBtState] = useState('Unknown');
  const [lastCmd, setLastCmd] = useState('');
  const [activeDirs, setActiveDirs] = useState<Set<DirKey>>(new Set());
  const isConnected = useCaDAConnection();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeDirsRef = useRef<Set<DirKey>>(new Set());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const ok = await initAdvertiser();
      if (ok) {
        setStatus(t('control.ready'));
        setBtState('PoweredOn');
      } else {
        setStatus(t('control.errorBle'));
        setBtState('Error');
      }
    })();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);




  const handlePressIn = useCallback((dir: DirKey) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    const cmd = DIR_CMD[dir];
    activeDirsRef.current = new Set([dir]);
    setActiveDirs(new Set([dir]));
    setStatus(`${t('control.active')}: ${dir}`);
    setLastCmd(dir);
    
    broadcastCommand(cmd, true);
    intervalRef.current = setInterval(() => broadcastCommand(cmd), 40);
  }, []);

  const handlePressOut = useCallback((dir: DirKey) => {
    const newDirs = new Set(activeDirsRef.current);
    newDirs.delete(dir);
    activeDirsRef.current = newDirs;
    setActiveDirs(newDirs);
    
    if (newDirs.size === 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      sendStop();
      setStatus(t('control.idle'));
      setLastCmd('STOP');
    }
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
            <Text style={styles.backBtnText}>{t('control.backToGarage')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.status}>{status}</Text>
          <Image
            source={require('../../assets/car_top.png')}
            style={styles.carImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.dpadWrapper}>
          <View style={styles.dpadInnerGlow}>
            <View style={styles.dpadRow}>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadDiag, activeDirs.has('FWD_LEFT') && styles.dpadActive]}
                onPressIn={() => handlePressIn('FWD_LEFT')} onPressOut={() => handlePressOut('FWD_LEFT')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>↖</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadUp, activeDirs.has('FWD') && styles.dpadActive]}
                onPressIn={() => handlePressIn('FWD')} onPressOut={() => handlePressOut('FWD')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadDiag, activeDirs.has('FWD_RIGHT') && styles.dpadActive]}
                onPressIn={() => handlePressIn('FWD_RIGHT')} onPressOut={() => handlePressOut('FWD_RIGHT')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>↗</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dpadRow}>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadSide, activeDirs.has('LEFT') && styles.dpadActive]}
                onPressIn={() => handlePressIn('LEFT')} onPressOut={() => handlePressOut('LEFT')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>◀</Text>
              </TouchableOpacity>
              <View style={styles.dpadCenter}><View style={styles.dpadCenterDot} /></View>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadSide, activeDirs.has('RIGHT') && styles.dpadActive]}
                onPressIn={() => handlePressIn('RIGHT')} onPressOut={() => handlePressOut('RIGHT')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>▶</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dpadRow}>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadDiag, activeDirs.has('REV_LEFT') && styles.dpadActive]}
                onPressIn={() => handlePressIn('REV_LEFT')} onPressOut={() => handlePressOut('REV_LEFT')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>↙</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadDown, activeDirs.has('REV') && styles.dpadActive]}
                onPressIn={() => handlePressIn('REV')} onPressOut={() => handlePressOut('REV')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>▼</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dpadBtn, styles.dpadDiag, activeDirs.has('REV_RIGHT') && styles.dpadActive]}
                onPressIn={() => handlePressIn('REV_RIGHT')} onPressOut={() => handlePressOut('REV_RIGHT')} activeOpacity={0.8}>
                <Text style={styles.dpadIcon}>↘</Text>
              </TouchableOpacity>
            </View>
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
    marginVertical: 4,
  },
  carImage: {
    width: 140,
    height: 140,
    marginTop: 6,
    opacity: 0.92,
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
    width: 70, 
    height: 70,
    borderRadius: 20,
    backgroundColor: 'rgba(30, 30, 45, 0.8)',
    justifyContent: 'center', 
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  dpadDiag: {
    backgroundColor: 'rgba(20, 20, 35, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
  dpadUp: {},
  dpadDown: {},
  dpadSide: {},
  dpadCenter: { 
    width: 70, 
    height: 70, 
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
    fontSize: 28,
    fontWeight: '900',
  },
  diagIcon: {
    fontSize: 22,
    opacity: 0.7,
  },
  dpadIconActive: {
    color: '#fff',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});

export default ControlScreen;
