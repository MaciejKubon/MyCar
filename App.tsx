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
import { useTranslation } from 'react-i18next';

import './src/i18n';
import SplashScreen from './src/screens/SplashScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import ControlScreen from './src/screens/ControlScreen';
import BlocksScreen from './src/screens/BlocksScreen';
import DrawScreen from './src/screens/DrawScreen';
import DebugScreen from './src/screens/DebugScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import { startGlobalScan } from './src/services/BleScanner';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabIcon: React.FC<{ emoji: string }> = ({ emoji }) => (
  <Text style={{ fontSize: 22 }}>{emoji}</Text>
);

const MainTabs = () => {
  const { t } = useTranslation();

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
          tabBarLabel: t('tabs.control'),
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="🎮" />
          ),
        }}
      />
      <Tab.Screen
        name="Blocks"
        component={BlocksScreen}
        options={{
          tabBarLabel: t('tabs.blocks'),
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="🧩" />
          ),
        }}
      />
      <Tab.Screen
        name="Draw"
        component={DrawScreen}
        options={{
          tabBarLabel: t('tabs.draw'),
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="🖌️" />
          ),
        }}
      />
      {__DEV__ && (
        <Tab.Screen
          name="Debug"
          component={DebugScreen}
          options={{
            tabBarLabel: t('tabs.debug'),
            tabBarIcon: ({ color, size }) => (
              <TabIcon emoji="⚙️" />
            ),
          }}
        />
      )}
      {__DEV__ && (
        <Tab.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{
            tabBarLabel: t('tabs.scanner'),
            tabBarIcon: ({ color, size }) => (
              <TabIcon emoji="📡" />
            ),
          }}
        />
      )}
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
      startGlobalScan();
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a14" translucent={false} />
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="Splash"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="MainTabs" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
