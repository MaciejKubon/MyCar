import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startGlobalScan, stopScan, addScanListener, ScannedDevice, checkBluetoothState, onStateChange } from '../services/BleScanner';
import BleStatusBar from '../components/StatusBar';
import { useTranslation } from 'react-i18next';

const ScannerScreen: React.FC = () => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Map<string, ScannedDevice>>(new Map());
  const [isScanning, setIsScanning] = useState(false);
  const [btState, setBtState] = useState('Unknown');
  const [filter, setFilter] = useState<'all' | 'cada'>('cada');

  useEffect(() => {
    const unsubState = onStateChange((state) => {
      setBtState(state);
    });

    requestPermissions().then(() => {
      startGlobalScan();
      setIsScanning(true);
    });

    return () => {
      unsubState.remove();
    };
  }, []);

  useEffect(() => {
    if (!isScanning) return;
    
    const removeListener = addScanListener((device) => {
      setDevices(prev => {
        const next = new Map(prev);
        const existing = next.get(device.id);
        if (!existing || device.timestamp - existing.timestamp > 500) {
          next.set(device.id, device);
        }
        return next;
      });
    });

    return removeListener;
  }, [isScanning]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
      } catch (e) {
        console.error('Permission error:', e);
      }
    }
  };

  const toggleScan = useCallback(() => {
    if (isScanning) {
      stopScan();
      setIsScanning(false);
    } else {
      setDevices(new Map());
      startGlobalScan();
      setIsScanning(true);
    }
  }, [isScanning]);

  const getDeviceList = useCallback(() => {
    const all = Array.from(devices.values());
    if (filter === 'cada') {
      return all.filter(d => d.isCaDA);
    }
    return all.sort((a, b) => {
      if (a.isCaDA && !b.isCaDA) return -1;
      if (!a.isCaDA && b.isCaDA) return 1;
      return (b.rssi || -100) - (a.rssi || -100);
    });
  }, [devices, filter]);

  const getRSSIColor = (rssi: number | null) => {
    if (rssi === null) return '#555';
    if (rssi > -50) return '#4CAF50';
    if (rssi > -70) return '#FFC107';
    if (rssi > -85) return '#FF9800';
    return '#FF5252';
  };

  const getRSSIBars = (rssi: number | null) => {
    if (rssi === null) return '░░░░';
    if (rssi > -50) return '████';
    if (rssi > -65) return '███░';
    if (rssi > -80) return '██░░';
    if (rssi > -90) return '█░░░';
    return '░░░░';
  };

  const renderDevice = ({ item }: { item: ScannedDevice }) => (
    <View style={[styles.deviceCard, item.isCaDA && styles.cadaCard]}>
      <View style={styles.deviceHeader}>
        <View style={styles.deviceNameRow}>
          {item.isCaDA && <Text style={styles.cadaBadge}>🚗 CaDA</Text>}
          <Text style={styles.deviceName}>
            {item.name || t('scanner.unknownDevice')}
          </Text>
        </View>
        <View style={styles.rssiContainer}>
          <Text style={[styles.rssiBars, { color: getRSSIColor(item.rssi) }]}>
            {getRSSIBars(item.rssi)}
          </Text>
          <Text style={[styles.rssiValue, { color: getRSSIColor(item.rssi) }]}>
            {item.rssi ?? '?'} dBm
          </Text>
        </View>
      </View>
      
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceId}>{item.id}</Text>
        {item.isCaDA && (
          <Text style={styles.deviceType}>
            {t('scanner.type')}: {item.type === 'HS' ? '🔵 HS (HSZ_HS)' : '🟢 PC (0xFFF0)'}
          </Text>
        )}
        {item.manufacturerData && (
          <Text style={styles.mfgData} numberOfLines={2}>
            MFG: {item.manufacturerData}
          </Text>
        )}
      </View>
    </View>
  );

  const deviceList = getDeviceList();

  return (
    <SafeAreaView style={styles.container}>
      <BleStatusBar bluetoothState={btState} isBroadcasting={false} />

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.scanBtn, isScanning && styles.scanBtnActive]}
          onPress={toggleScan}
        >
          <Text style={styles.scanBtnText}>
            {isScanning ? `⏹ ${t('scanner.stop')}` : `📡 ${t('scanner.scan')}`}
          </Text>
        </TouchableOpacity>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'cada' && styles.filterBtnActive]}
            onPress={() => setFilter('cada')}
          >
            <Text style={[styles.filterText, filter === 'cada' && styles.filterTextActive]}>
              🚗 CaDA
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
              {t('scanner.all')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.countText}>
          {deviceList.length} {t('scanner.devices')} • {devices.size} {t('scanner.total')}
        </Text>
      </View>

      <FlatList
        data={deviceList}
        keyExtractor={(item) => item.id}
        renderItem={renderDevice}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>
              {isScanning ? '📡' : '🔍'}
            </Text>
            <Text style={styles.emptyText}>
              {isScanning
                ? filter === 'cada'
                  ? t('scanner.searchingCada')
                  : t('scanner.scanning')
                : t('scanner.pressScan')}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  controls: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  scanBtn: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  scanBtnActive: {
    backgroundColor: 'rgba(255, 60, 60, 0.15)',
    borderColor: 'rgba(255, 60, 60, 0.3)',
  },
  scanBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterBtnActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.12)',
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  filterText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#9B95FF',
  },
  countText: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  list: {
    padding: 12,
  },
  deviceCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cadaCard: {
    borderColor: 'rgba(108, 99, 255, 0.25)',
    backgroundColor: 'rgba(108, 99, 255, 0.06)',
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cadaBadge: {
    fontSize: 11,
    color: '#6C63FF',
    fontWeight: '700',
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  deviceName: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  rssiContainer: {
    alignItems: 'flex-end',
  },
  rssiBars: {
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  rssiValue: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  deviceInfo: {
    marginTop: 8,
  },
  deviceId: {
    color: '#555',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  deviceType: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
  mfgData: {
    color: '#555',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default ScannerScreen;
