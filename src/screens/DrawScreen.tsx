import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, G, Line } from 'react-native-svg';
import { broadcastCommand, sendStop } from '../services/BleAdvertiser';
import { CADA_PC_COMMANDS } from '../utils/commands';
import { useTranslation } from 'react-i18next';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Point {
  x: number;
  y: number;
}

class ErrorBoundaryInner extends React.Component<any & WithTranslation, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: error.toString() };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("[DrawScreen Crash]", error, errorInfo);
  }
  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#4a0000', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>{t('draw.errorTitle')}</Text>
          <Text style={{ color: '#ffaaaa', marginTop: 10 }}>{t('draw.errorMsg')}</Text>
          <Text style={{ color: 'white', fontFamily: 'monospace', marginTop: 5 }}>{this.state.errorMsg}</Text>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}
const ErrorBoundary = withTranslation()(ErrorBoundaryInner);

function getCommandForVector(dx: number, dy: number): number[] | null {
  const THRESHOLD = 12;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx < THRESHOLD && absDy < THRESHOLD) return null;

  const isFwd   = dy < 0;
  const isBack  = dy > 0;
  const isLeft  = dx < 0;
  const isRight = dx > 0;

  const DIAGONAL_RATIO = 2.5;

  if (absDy > absDx * DIAGONAL_RATIO) {
    return isFwd ? CADA_PC_COMMANDS.FWD : CADA_PC_COMMANDS.REV;
  }
  if (absDx > absDy * DIAGONAL_RATIO) {
    return isRight ? CADA_PC_COMMANDS.RIGHT : CADA_PC_COMMANDS.LEFT;
  }

  if (isFwd  && isLeft)  return CADA_PC_COMMANDS.FWD_LEFT;
  if (isFwd  && isRight) return CADA_PC_COMMANDS.FWD_RIGHT;
  if (isBack && isLeft)  return CADA_PC_COMMANDS.REV_LEFT;
  if (isBack && isRight) return CADA_PC_COMMANDS.REV_RIGHT;

  return null;
}

function DrawScreenInner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [points, setPoints] = useState<Point[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCmd, setCurrentCmd] = useState('');

  const isExecutingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (isExecutingRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        setPoints([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (evt) => {
        if (isExecutingRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        setPoints(prev => {
          if (prev.length === 0) return [{ x: locationX, y: locationY }];
          const last = prev[prev.length - 1];
          const dist = Math.sqrt(Math.pow(locationX - last.x, 2) + Math.pow(locationY - last.y, 2));
          if (dist > 12) {
            return [...prev, { x: locationX, y: locationY }];
          }
          return prev;
        });
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const getSvgPath = () => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  const clearCanvas = () => {
    if (isExecuting) return;
    setPoints([]);
    setProgress(0);
    setCurrentCmd('');
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runPath = async () => {
    if (points.length < 2) return;
    setIsExecuting(true);
    isExecutingRef.current = true;
    setProgress(0);

    const MS_PER_PX = 8;
    const TICK = 100;
    const totalSegments = points.length - 1;

    for (let i = 1; i < points.length; i++) {
      if (!isExecutingRef.current) break;

      const p1 = points[i - 1];
      const p2 = points[i];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);

      const cmd = getCommandForVector(dx, dy);
      if (!cmd) {
        setProgress(i / totalSegments);
        continue;
      }

      const duration = segLen * MS_PER_PX;
      const ticks = Math.max(1, Math.floor(duration / TICK));

      const cmdName = Object.entries(CADA_PC_COMMANDS)
        .find(([, v]) => v === cmd)?.[0] ?? '';
      setCurrentCmd(cmdName);

      for (let t = 0; t < ticks; t++) {
        if (!isExecutingRef.current) break;
        await broadcastCommand(cmd, true);
        await sleep(TICK);
      }

      setProgress(i / totalSegments);
    }

    await sendStop();
    setIsExecuting(false);
    isExecutingRef.current = false;
    setCurrentCmd('STOP');
    setProgress(1);
  };

  const stopSequence = async () => {
    isExecutingRef.current = false;
    setIsExecuting(false);
    await sendStop();
    setCurrentCmd('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('draw.title')}</Text>
        <Text style={styles.subtitle}>
          {isExecuting ? `${t('draw.executing')}: ${currentCmd}` : t('draw.drawHint')}
        </Text>
      </View>

      {isExecuting && (
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}

      <View style={styles.canvasContainer}>
        <View style={styles.canvasBoard} {...panResponder.panHandlers}>
          <Svg style={StyleSheet.absoluteFill}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Line key={`h${i}`} x1="0" y1={`${(i + 1) * 12.5}%`} x2="100%" y2={`${(i + 1) * 12.5}%`}
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <Line key={`v${i}`} x1={`${(i + 1) * 12.5}%`} y1="0" x2={`${(i + 1) * 12.5}%`} y2="100%"
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}

            {points.length > 0 && (
              <G>
                <Path
                  d={getSvgPath()}
                  stroke="rgba(0, 250, 154, 0.15)"
                  strokeWidth={14}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <Path
                  d={getSvgPath()}
                  stroke="#00FA9A"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={isExecuting ? "10 6" : undefined}
                />
                <Circle cx={points[0].x} cy={points[0].y} r={10} fill="rgba(108,99,255,0.3)" />
                <Circle cx={points[0].x} cy={points[0].y} r={6} fill="#6C63FF" />
                <Circle cx={points[points.length-1].x} cy={points[points.length-1].y} r={10} fill="rgba(255,68,68,0.3)" />
                <Circle cx={points[points.length-1].x} cy={points[points.length-1].y} r={6} fill="#ff4444" />
              </G>
            )}
          </Svg>

          {points.length === 0 && (
            <View style={styles.hintBox}>
              <Text style={styles.hintIcon}>✏️</Text>
              <Text style={styles.hintText}>{t('draw.drawHint')}</Text>
              <Text style={styles.hintSub}>{t('draw.diagonalHint')}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.controlsArea, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.mainActions}>
          <TouchableOpacity
            style={[styles.playBtn, isExecuting && styles.stopBtn]}
            onPress={isExecuting ? stopSequence : runPath}
            disabled={!isExecuting && points.length < 2}
          >
            <Text style={styles.playBtnText}>
              {isExecuting ? t('draw.stop') : t('draw.run')}
            </Text>
          </TouchableOpacity>

          {!isExecuting && (
            <TouchableOpacity style={styles.clearBtn} onPress={clearCanvas}>
               <Text style={styles.clearBtnText}>{t('draw.clear')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6C63FF' }]} />
            <Text style={styles.legendText}>{t('draw.legendStart')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ff4444' }]} />
            <Text style={styles.legendText}>{t('draw.legendEnd')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#00FA9A' }]} />
            <Text style={styles.legendText}>{t('draw.legendRoute')}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function DrawScreen() {
  return (
    <ErrorBoundary>
      <DrawScreenInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
  header: { alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  title: { color: '#00FA9A', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#666', fontSize: 12, marginTop: 4 },
  progressBarBg: {
    height: 3,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00FA9A',
    borderRadius: 2,
  },
  canvasContainer: {
    flex: 1,
    margin: 16,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,24,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  canvasBoard: { flex: 1 },
  hintBox: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', gap: 6 },
  hintIcon: { fontSize: 36, marginBottom: 4 },
  hintText: { color: '#444', fontSize: 16, fontWeight: '700' },
  hintSub: { color: '#333', fontSize: 11 },
  controlsArea: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  mainActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  playBtn: {
    flex: 1,
    backgroundColor: 'rgba(0, 250, 154, 0.15)',
    borderWidth: 1,
    borderColor: '#00FA9A',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopBtn: { backgroundColor: 'rgba(255, 50, 50, 0.15)', borderColor: '#ff3333' },
  playBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  clearBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  clearBtnText: { color: '#aaa', fontWeight: '600' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: '#555', fontSize: 10 },
});
