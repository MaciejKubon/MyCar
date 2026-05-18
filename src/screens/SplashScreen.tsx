import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function SplashScreen({ navigation }: any) {
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 10,
        useNativeDriver: true,
      })
    ]).start();

    const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
        }).start(() => {
            navigation.replace('Welcome');
        });
    }, 2500);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim, navigation]);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🏎️</Text>
        </View>
        <Text style={styles.title}>Autonomous<Text style={styles.titleHighlight}>RC</Text></Text>
        <Text style={styles.subtitle}>CaDA D-Pad Protocol</Text>
      </Animated.View>
      
      <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
         <Text style={styles.footerText}>{t('common.loading')}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  icon: {
    fontSize: 60,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  titleHighlight: {
    color: '#6C63FF',
  },
  subtitle: {
    fontSize: 14,
    color: '#00FA9A',
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 50,
  },
  footerText: {
    color: '#444',
    fontSize: 12,
    letterSpacing: 1,
  }
});
