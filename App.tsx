/**
 * MyCar — Aplikacja do sterowania samochodem CaDA przez BLE Advertising.
 * 
 * Komunikacja: BLE Advertising (bezpołączeniowo)
 * Manufacturer ID: 0xC200 (49664)
 * Protokół: eksperymentalny (odkrywanie przez debugger)
 */

import React, { useEffect } from 'react';
import {
  PermissionsAndroid,
  Platform,
  StatusBar,
  Text,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WelcomeScreen from './src/screens/WelcomeScreen';
import ControlScreen from './src/screens/ControlScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import DebugScreen from './src/screens/DebugScreen';
import { startGlobalScan } from './src/services/BleScanner';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Prosty komponent ikony tab-a (emoji zamiast vector icons)
const TabIcon: React.FC<{ emoji: string }> = ({ emoji }) => (
  <Text style={{ fontSize: 22 }}>{emoji}</Text>
);

// Zawartość głównego panelu nawigacyjnego z zakładkami
const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a14',
          borderTopColor: 'rgba(255,255,255,0.05)',
          borderTopWidth: 1,
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#555',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          paddingBottom: 4,
        },
      }}
    >
      <Tab.Screen
        name="Control"
        component={ControlScreen}
        options={{
          tabBarLabel: 'Sterowanie',
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="🎮" />
          ),
        }}
      />
      <Tab.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{
          tabBarLabel: 'Skaner',
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="📡" />
          ),
        }}
      />
      <Tab.Screen
        name="Debug"
        component={DebugScreen}
        options={{
          tabBarLabel: 'Debugger',
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="🔧" />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const App = () => {
  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        if (Platform.Version >= 31) {
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          console.log('[MyCar] Permissions 12+:', results);
        } else {
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ]);
          console.log('[MyCar] Permissions <12:', results);
        }
      } catch (error) {
        console.error('[MyCar] Permission error:', error);
      }
      // Po uprawnieniach startujemy skanowanie w tle, bez względu na zakładkę
      startGlobalScan();
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a14" translucent={false} />
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="Welcome"
          screenOptions={{ headerShown: false }}
        >
          {/* Ekran wyboru Garażu */}
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          
          {/* Panel właściwy samochodu z dolnymi zakładkami */}
          <Stack.Screen name="MainTabs" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
