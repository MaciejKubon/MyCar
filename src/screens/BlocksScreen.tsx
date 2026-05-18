import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { broadcastCommand, sendStop } from '../services/BleAdvertiser';
import { CADA_PC_COMMANDS } from '../utils/commands';
import { useTranslation } from 'react-i18next';

type InstructionType = 'FWD' | 'REV' | 'LEFT' | 'RIGHT' | 'FWD_LEFT' | 'FWD_RIGHT' | 'REV_LEFT' | 'REV_RIGHT';

interface ProgramBlock {
  id: string;
  type: InstructionType;
  durationMs: number;
}

const ICONS: Record<InstructionType, string> = {
  FWD: '▲',
  REV: '▼',
  LEFT: '◀',
  RIGHT: '▶',
  FWD_LEFT: '↖',
  FWD_RIGHT: '↗',
  REV_LEFT: '↙',
  REV_RIGHT: '↘',
};



export default function BlocksScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState<ProgramBlock[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  
  const isExecutingRef = useRef(false);

  const addBlock = (type: InstructionType) => {
    if (isExecuting) return;
    setBlocks(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        type,
        durationMs: 1000,
      }
    ]);
  };

  const removeBlock = (id: string) => {
    if (isExecuting) return;
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const increaseDuration = (id: string) => {
    if (isExecuting) return;
    setBlocks(prev => prev.map(b => 
      b.id === id ? { ...b, durationMs: b.durationMs + 200 } : b
    ));
  };

  const decreaseDuration = (id: string) => {
    if (isExecuting) return;
    setBlocks(prev => prev.map(b => 
      b.id === id ? { ...b, durationMs: Math.max(200, b.durationMs - 200) } : b
    ));
  };

  const clearBlocks = () => {
    if (isExecuting) return;
    setBlocks([]);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runSequence = async () => {
    if (blocks.length === 0) return;
    
    setIsExecuting(true);
    isExecutingRef.current = true;

    for (let i = 0; i < blocks.length; i++) {
        if (!isExecutingRef.current) break;

        const block = blocks[i];
        setActiveBlockId(block.id);

        let cmd: number[] | null = null;
        switch (block.type) {
            case 'FWD':       cmd = CADA_PC_COMMANDS.FWD; break;
            case 'REV':       cmd = CADA_PC_COMMANDS.REV; break;
            case 'LEFT':      cmd = CADA_PC_COMMANDS.LEFT; break;
            case 'RIGHT':     cmd = CADA_PC_COMMANDS.RIGHT; break;
            case 'FWD_LEFT':  cmd = CADA_PC_COMMANDS.FWD_LEFT; break;
            case 'FWD_RIGHT': cmd = CADA_PC_COMMANDS.FWD_RIGHT; break;
            case 'REV_LEFT':  cmd = CADA_PC_COMMANDS.REV_LEFT; break;
            case 'REV_RIGHT': cmd = CADA_PC_COMMANDS.REV_RIGHT; break;
        }

        const tickTime = 100;
        const ticks = Math.floor(block.durationMs / tickTime);
        for(let t = 0; t < ticks; t++) {
             if (!isExecutingRef.current) break;
             if (cmd) await broadcastCommand(cmd, true);
             await sleep(tickTime);
        }
    }

    await sendStop();
    setActiveBlockId(null);
    setIsExecuting(false);
    isExecutingRef.current = false;
  };

  const stopSequence = async () => {
    isExecutingRef.current = false;
    setIsExecuting(false);
    await sendStop();
  };

  const getLabel = (type: InstructionType): string => {
    const keys = {
      FWD: 'blocks.fwd',
      REV: 'blocks.rev',
      LEFT: 'blocks.left',
      RIGHT: 'blocks.right',
      FWD_LEFT: 'blocks.fwdLeft',
      FWD_RIGHT: 'blocks.fwdRight',
      REV_LEFT: 'blocks.revLeft',
      REV_RIGHT: 'blocks.revRight',
    } as const;
    return t(keys[type] as any) as string;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('blocks.title')}</Text>
        <Text style={styles.subtitle}>{t('blocks.subtitle')}</Text>
      </View>

      <View style={styles.programArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {blocks.length === 0 ? (
             <Text style={styles.emptyText}>{t('blocks.emptyText')}</Text>
          ) : (
            blocks.map((block, index) => {
              const isActive = activeBlockId === block.id;
              return (
                <View key={block.id} style={[styles.blockCard, isActive && styles.blockActive]}>
                  <View style={styles.blockIconCont}>
                     <Text style={[styles.blockIcon, isActive && styles.blockIconActive]}>{ICONS[block.type]}</Text>
                  </View>
                  <View style={styles.blockInfo}>
                     <Text style={[styles.blockName, isActive && styles.blockIconActive]}>{getLabel(block.type)}</Text>
                     <View style={styles.durationControl}>
                        <TouchableOpacity style={styles.timeBtn} onPress={() => decreaseDuration(block.id)}>
                            <Text style={styles.timeBtnText}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.durationText}>{(block.durationMs / 1000).toFixed(1)}s</Text>
                        <TouchableOpacity style={styles.timeBtn} onPress={() => increaseDuration(block.id)}>
                            <Text style={styles.timeBtnText}>+</Text>
                        </TouchableOpacity>
                     </View>
                  </View>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeBlock(block.id)}>
                     <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      <View style={[styles.controlsArea, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.mainActions}>
           <TouchableOpacity 
             style={[styles.playBtn, isExecuting && styles.stopBtn]} 
             onPress={isExecuting ? stopSequence : runSequence}
           >
             <Text style={styles.playBtnText}>{isExecuting ? t('blocks.stop') : t('blocks.run')}</Text>
           </TouchableOpacity>
           
           {!isExecuting && (
             <TouchableOpacity style={styles.clearBtn} onPress={clearBlocks}>
               <Text style={styles.clearBtnText}>{t('blocks.clear')}</Text>
             </TouchableOpacity>
           )}
        </View>

        <Text style={styles.paletteLabel}>{t('blocks.directions')}</Text>
        <View style={styles.palette}>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('FWD_LEFT')}>
              <Text style={styles.paletteIcon}>↖</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('FWD')}>
              <Text style={styles.paletteIcon}>▲</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('FWD_RIGHT')}>
              <Text style={styles.paletteIcon}>↗</Text>
           </TouchableOpacity>
        </View>
        <View style={[styles.palette, { marginTop: 8 }]}>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('LEFT')}>
              <Text style={styles.paletteIcon}>◀</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('REV')}>
              <Text style={styles.paletteIcon}>▼</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('RIGHT')}>
              <Text style={styles.paletteIcon}>▶</Text>
           </TouchableOpacity>
        </View>
        <View style={[styles.palette, { marginTop: 8 }]}>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('REV_LEFT')}>
              <Text style={styles.paletteIcon}>↙</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.paletteBtn} onPress={() => addBlock('REV_RIGHT')}>
              <Text style={styles.paletteIcon}>↘</Text>
           </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 10 },
  title: { color: '#00FA9A', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#666', fontSize: 12, marginTop: 4 },
  programArea: { flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', margin: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  scrollContent: { padding: 16 },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
  blockCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  blockActive: { backgroundColor: 'rgba(108, 99, 255, 0.4)', borderColor: '#6C63FF', shadowColor: '#6C63FF', shadowRadius: 10, shadowOpacity: 0.8, elevation: 5 },
  blockIconCont: { width: 40, height: 40, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  blockIcon: { fontSize: 20, color: '#888' },
  blockIconActive: { color: '#fff', textShadowColor: '#fff', textShadowRadius: 8 },
  blockInfo: { flex: 1, marginLeft: 16 },
  blockName: { color: '#ddd', fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  durationControl: { flexDirection: 'row', alignItems: 'center' },
  timeBtn: { width: 30, height: 26, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
  timeBtnText: { color: '#fff', fontWeight: 'bold' },
  durationText: { color: '#00FA9A', marginHorizontal: 12, fontSize: 14, fontWeight: '800', minWidth: 40, textAlign: 'center' },
  removeBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { color: '#ff4444', fontSize: 18, fontWeight: 'bold' },
  controlsArea: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  mainActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  playBtn: { flex: 1, backgroundColor: 'rgba(0, 250, 154, 0.2)', borderWidth: 1, borderColor: '#00FA9A', borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  stopBtn: { backgroundColor: 'rgba(255, 50, 50, 0.2)', borderColor: '#ff3333' },
  playBtnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  clearBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  clearBtnText: { color: '#aaa', fontWeight: '600' },
  paletteLabel: { color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  palette: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  paletteBtn: { width: 70, aspectRatio: 1, backgroundColor: 'rgba(40,40,60,0.8)', borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  paletteIcon: { fontSize: 24, color: '#aaa' },
});
