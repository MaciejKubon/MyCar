
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';

interface JoystickProps {
  size?: number;
  onMove: (x: number, y: number) => void;
  onRelease: () => void;
  color?: string;
}

const Joystick: React.FC<JoystickProps> = ({
  size = 200,
  onMove,
  onRelease,
  color = '#6C63FF',
}) => {
  const knobSize = size * 0.4;
  const maxDistance = (size - knobSize) / 2;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [isActive, setIsActive] = useState(false);

  const clamp = useCallback(
    (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max),
    []
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        setIsActive(true);
      },

      onPanResponderMove: (_, gestureState) => {
        const { dx, dy } = gestureState;


        const distance = Math.sqrt(dx * dx + dy * dy);
        let clampedX = dx;
        let clampedY = dy;

        if (distance > maxDistance) {
          const ratio = maxDistance / distance;
          clampedX = dx * ratio;
          clampedY = dy * ratio;
        }

        pan.setValue({ x: clampedX, y: clampedY });


        const normalizedX = clamp(clampedX / maxDistance, -1, 1);
        const normalizedY = clamp(-clampedY / maxDistance, -1, 1);

        onMove(normalizedX, normalizedY);
      },

      onPanResponderRelease: () => {
        setIsActive(false);
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          friction: 5,
          useNativeDriver: false,
        }).start();
        onRelease();
      },
    })
  ).current;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: isActive ? color : 'rgba(255,255,255,0.15)',
        },
      ]}
    >

      <View style={[styles.crossH, { width: size * 0.6 }]} />
      <View style={[styles.crossV, { height: size * 0.6 }]} />


      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.knob,
          {
            width: knobSize,
            height: knobSize,
            borderRadius: knobSize / 2,
            backgroundColor: isActive ? color : 'rgba(108, 99, 255, 0.6)',
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
            ],
            shadowColor: color,
            shadowOpacity: isActive ? 0.8 : 0.3,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
  },
  crossH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  knob: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    elevation: 8,
  },
});

export default Joystick;
