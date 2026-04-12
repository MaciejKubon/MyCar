/**
 * Pasek statusu BLE — pokazuje stan Bluetooth i nadawania.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatusBarProps {
  bluetoothState: string;
  isBroadcasting: boolean;
  lastCommand?: string;
  isConnected?: boolean;
}

const BleStatusBar: React.FC<StatusBarProps> = ({
  bluetoothState,
  isBroadcasting,
  lastCommand,
  isConnected,
}) => {
  const getBtIcon = () => {
    switch (bluetoothState) {
      case 'PoweredOn':
        return '🟢';
      case 'PoweredOff':
        return '🔴';
      default:
        return '🟡';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>
          {getBtIcon()} BT: {bluetoothState === 'PoweredOn' ? 'ON' : bluetoothState}
        </Text>
        <Text style={styles.label}>
          {isBroadcasting ? '📡 Nadaję' : '⏸️ Stop'}
        </Text>
        {isConnected !== undefined && (
          <View style={[styles.connectionBadge, isConnected ? styles.connected : styles.disconnected]}>
            <Text style={styles.connectionText}>
              {isConnected ? '🟢 Połączono z CaDA' : '🔴 Rozłączono'}
            </Text>
          </View>
        )}
      </View>
      {lastCommand && (
        <Text style={styles.command} numberOfLines={1}>
          Ostatnia: {lastCommand}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '500',
  },
  command: {
    color: '#888',
    fontSize: 10,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  connectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  connected: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  disconnected: {
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  connectionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ddd',
  },
});

export default BleStatusBar;
