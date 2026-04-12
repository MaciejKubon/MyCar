import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen({ navigation }: any) {
  // Przejście do głównego Tab Navigatora
  const handleSelectCar = () => {
    navigation.navigate('MainTabs'); 
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GARAŻ</Text>
        <Text style={styles.subtitle}>Wybierz swój pojazd</Text>
      </View>

      <View style={styles.carousel}>
        {/* Karta samochodu */}
        <View style={styles.carCard}>
          {/* Ozdobne tło karty / neon */}
          <View style={styles.neonGlow} />
          <View style={styles.neonGlowRight} />

          <View style={styles.cardContent}>
            {/* Wygenerowana grafika geometryczna samochodu */}
            <View style={styles.carVisual}>
              <Text style={styles.carEmoji}>🏎️💨</Text>
            </View>

            <View style={styles.carInfo}>
              <Text style={styles.carName}>CaDA Master Pro</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>PC Model (0xFFF0)</Text>
                </View>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>D-Pad Replay</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleSelectCar}
              activeOpacity={0.8}
            >
              <Text style={styles.actionBtnText}>START ENGINE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          CaDA BLE Control System v1.0
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
    justifyContent: 'space-between',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  title: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: 'rgba(255, 255, 255, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    color: '#6C63FF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  carousel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  carCard: {
    width: '100%',
    height: 440,
    backgroundColor: 'rgba(25, 25, 35, 0.65)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  neonGlow: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(108, 99, 255, 0.3)',
    opacity: 0.6,
  },
  neonGlowRight: {
    position: 'absolute',
    bottom: -80,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(0, 250, 154, 0.15)',
    opacity: 0.6,
  },
  cardContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  carVisual: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carEmoji: {
    fontSize: 100,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 10 },
    textShadowRadius: 15,
  },
  carInfo: {
    marginBottom: 24,
  },
  carName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tagText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtn: {
    width: '100%',
    height: 60,
    backgroundColor: 'rgba(108, 99, 255, 0.9)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(180, 175, 255, 0.5)',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  footer: {
    paddingBottom: 24,
    alignItems: 'center',
  },
  footerText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
