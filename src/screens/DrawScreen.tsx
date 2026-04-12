import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { broadcastCommand, sendStop } from '../services/BleAdvertiser';
import { CADA_PC_COMMANDS } from '../utils/commands';

interface Point {
  x: number;
  y: number;
}

const { width, height } = Dimensions.get('window');

class ErrorBoundary extends React.Component<any, any> {
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
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#4a0000', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>Awaria Modułu SVG!</Text>
          <Text style={{ color: '#ffaaaa', marginTop: 10 }}>Treść błędu:</Text>
          <Text style={{ color: 'white', fontFamily: 'monospace', marginTop: 5 }}>{this.state.errorMsg}</Text>
          <Text style={{ color: 'yellow', marginTop: 20 }}>Prawdopodobna przyczyna: brak zlinkowanej paczki po instalacji react-native-svg. Uruchom npx expo run:android by przegenerować pliki javy.</Text>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// Prosty algorytm Dead Reckoning do tłumaczenia gestu na silniki:
// Oś Y = góra/dół (FWD/REV)
// Oś X = lewo/prawo (LEFT/RIGHT)

function DrawScreenInner() {
  const insets = useSafeAreaInsets();
  const [points, setPoints] = useState<Point[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  
  const isExecutingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (isExecuting) return;
        const { locationX, locationY } = evt.nativeEvent;
        setPoints([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (evt) => {
        if (isExecuting) return;
        const { locationX, locationY } = evt.nativeEvent;
        // Odfiltrowuj zbyt małe ruchy
        setPoints(prev => {
          if (prev.length === 0) return [{ x: locationX, y: locationY }];
          const last = prev[prev.length - 1];
          const dist = Math.sqrt(Math.pow(locationX - last.x, 2) + Math.pow(locationY - last.y, 2));
          if (dist > 15) { // co 15 pixeli nowa próbka do wektora
            return [...prev, { x: locationX, y: locationY }];
          }
          return prev;
        });
      },
      onPanResponderRelease: () => {
         // Koniec rysowania
      },
    })
  ).current;

  const getSvgPath = () => {
    if (points.length === 0) return '';
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return d;
  };

  const clearCanvas = () => {
    if (isExecuting) return;
    setPoints([]);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Moduł analizy wektorowej (Eksperymentalny Dead-Reckoning)
  const runPath = async () => {
    if (points.length < 2) return;
    setIsExecuting(true);
    isExecutingRef.current = true;

    // Każde przesunięcie o 1 pixel traktujemy jako mnożnik czasu.
    // 50 px w górę = (50 * multiplier) milisekund jazdy
    const TIME_MULTIPLIER = 10; 

    // Ustawiamy się względem wektora patrzenia. Przełożenie 2D na auto jest trudne.
    // Prostota: analizujemy odcinek po odcinku
    for (let i = 1; i < points.length; i++) {
        if (!isExecutingRef.current) break;

        const p1 = points[i - 1];
        const p2 = points[i];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        // Analiza ruchu Y (przód tył)
        if (Math.abs(dy) > 10) {
            const isFwd = dy < 0; // w górę ekranu to ujemne Y
            const duration = Math.abs(dy) * TIME_MULTIPLIER;
            const cmd = isFwd ? CADA_PC_COMMANDS.FWD : CADA_PC_COMMANDS.REV;
            
            const ticks = Math.max(1, Math.floor(duration / 100));
            for(let t=0; t<ticks; t++){
                if (!isExecutingRef.current) break;
                await broadcastCommand(cmd, true);
                await sleep(100);
            }
        }

        if (!isExecutingRef.current) break;

        // Analiza ruchu X (skręt punktowy)
        if (Math.abs(dx) > 10) {
            const isRight = dx > 0; // w prawo to dodatnie X
            // Skręt jest krótki by nie zawinąć auta wokół własnej osi - redukujemy czas skrętu
            const duration = Math.abs(dx) * (TIME_MULTIPLIER * 0.3);
            const cmd = isRight ? CADA_PC_COMMANDS.RIGHT : CADA_PC_COMMANDS.LEFT;
            
            const ticks = Math.max(1, Math.floor(duration / 100));
            for(let t=0; t<ticks; t++){
                if (!isExecutingRef.current) break;
                await broadcastCommand(cmd, true);
                await sleep(100);
            }
        }
    }

    await sendStop();
    setIsExecuting(false);
    isExecutingRef.current = false;
  };

  const stopSequence = async () => {
    isExecutingRef.current = false;
    setIsExecuting(false);
    await sendStop();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>RYSIK (Eksperymentalne)</Text>
        <Text style={styles.subtitle}>Narysuj trasę palcem</Text>
      </View>

      {/* Pudełko Canvas */}
      <View style={styles.canvasContainer}>
         <View style={styles.canvasBoard} {...panResponder.panHandlers}>
            {/* Siatka tła */}
            <View style={styles.gridOverlay}>
               {/* Prosty efekt linii w CSS dla klimatu */}
            </View>

            {/* Renderowanie Ścieżki */}
            <Svg style={StyleSheet.absoluteFill}>
               {points.length > 0 && (
                 <G>
                   <Path 
                     d={getSvgPath()} 
                     stroke="#00FA9A" 
                     strokeWidth={6} 
                     strokeLinecap="round" 
                     strokeLinejoin="round" 
                     fill="none" 
                   />
                   {/* Znacznik Startu */}
                   <Circle cx={points[0].x} cy={points[0].y} r={8} fill="#6C63FF" />
                   {/* Znacznik Końca */}
                   <Circle cx={points[points.length-1].x} cy={points[points.length-1].y} r={8} fill="#ff4444" />
                 </G>
               )}
            </Svg>
            
            {points.length === 0 && (
               <View style={styles.hintBox}>
                  <Text style={styles.hintText}>Rozpocznij rysowanie tutaj...</Text>
               </View>
            )}
         </View>
      </View>

      {/* Kontrolki */}
      <View style={[styles.controlsArea, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.mainActions}>
           <TouchableOpacity 
             style={[styles.playBtn, isExecuting && styles.stopBtn]} 
             onPress={isExecuting ? stopSequence : runPath}
             disabled={points.length === 0}
           >
             <Text style={styles.playBtnText}>{isExecuting ? '⏹ ZATRZYMAJ SILNIKI' : '▶ JEDŹ WEDŁUG TRASY'}</Text>
           </TouchableOpacity>
           
           {!isExecuting && (
             <TouchableOpacity style={styles.clearBtn} onPress={clearCanvas}>
               <Text style={styles.clearBtnText}>Usuń</Text>
             </TouchableOpacity>
           )}
        </View>
        <View style={styles.infoBox}>
           <Text style={styles.infoBoxText}>Algorytm dzieli narysowaną linię na składowe X i Y. Długość kreski odpowiada za czas obracania silnika napędowego. Wynik jazdy może odbiegać od proporcji płótna z powodu sił fizycznych (dywany, tarcie).</Text>
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
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 10 },
  title: { color: '#00FA9A', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#666', fontSize: 12, marginTop: 4 },
  canvasContainer: { flex: 1, margin: 16, borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(20,20,35,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  canvasBoard: { flex: 1, position: 'relative' },
  gridOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.1 }, // Miejsce na ewentualne tło siatki
  hintBox: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  hintText: { color: '#555', fontSize: 18, fontWeight: 'bold' },
  controlsArea: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  mainActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  playBtn: { flex: 1, backgroundColor: 'rgba(0, 250, 154, 0.2)', borderWidth: 1, borderColor: '#00FA9A', borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  stopBtn: { backgroundColor: 'rgba(255, 50, 50, 0.2)', borderColor: '#ff3333' },
  playBtnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  clearBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  clearBtnText: { color: '#aaa', fontWeight: '600' },
  infoBox: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 },
  infoBoxText: { color: '#888', fontSize: 10, lineHeight: 14, textAlign: 'justify' },
});
