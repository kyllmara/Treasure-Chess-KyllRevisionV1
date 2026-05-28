/**
 * Custom Native Slider Component
 * Replaces @react-native-community/slider which has compatibility issues
 * with the new React Native architecture
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  PanResponder,
  StyleSheet,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';

interface SliderProps {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  onSlidingStart?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const Slider: React.FC<SliderProps> = ({
  value = 0,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  minimumTrackTintColor = '#007AFF',
  maximumTrackTintColor = '#B3B3B3',
  thumbTintColor = '#FFFFFF',
  disabled = false,
  style,
}) => {
  const [sliderWidth, setSliderWidth] = useState(0);
  const [currentValue, setCurrentValue] = useState(value);
  const trackRef = useRef<View>(null);
  const trackLayoutRef = useRef({ x: 0, width: 0 });

  // Update current value when prop changes
  React.useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const getValueFromPosition = useCallback((positionX: number): number => {
    const trackWidth = trackLayoutRef.current.width;
    const trackX = trackLayoutRef.current.x;

    if (trackWidth <= 0) return minimumValue;

    const relativeX = positionX - trackX;
    const ratio = Math.max(0, Math.min(1, relativeX / trackWidth));
    let newValue = minimumValue + ratio * (maximumValue - minimumValue);

    if (step > 0) {
      newValue = Math.round(newValue / step) * step;
    }

    return Math.max(minimumValue, Math.min(maximumValue, newValue));
  }, [minimumValue, maximumValue, step]);

  const handleTouch = useCallback((pageX: number) => {
    const newValue = getValueFromPosition(pageX);
    setCurrentValue(newValue);
    onValueChange?.(newValue);
  }, [getValueFromPosition, onValueChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const newValue = getValueFromPosition(evt.nativeEvent.pageX);
        setCurrentValue(newValue);
        onSlidingStart?.(newValue);
        onValueChange?.(newValue);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const newValue = getValueFromPosition(evt.nativeEvent.pageX);
        setCurrentValue(newValue);
        onValueChange?.(newValue);
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        const newValue = getValueFromPosition(evt.nativeEvent.pageX);
        onSlidingComplete?.(newValue);
      },
    })
  ).current;

  const handleLayout = useCallback(() => {
    trackRef.current?.measureInWindow((x, y, width, height) => {
      trackLayoutRef.current = { x, width };
      setSliderWidth(width);
    });
  }, []);

  const ratio = sliderWidth > 0
    ? (currentValue - minimumValue) / (maximumValue - minimumValue)
    : 0;
  const thumbPosition = ratio * sliderWidth;

  return (
    <View
      style={[styles.container, style]}
      {...panResponder.panHandlers}
    >
      {/* Track background */}
      <View
        ref={trackRef}
        style={[styles.track, { backgroundColor: maximumTrackTintColor }]}
        onLayout={handleLayout}
      >
        {/* Filled track */}
        <View
          style={[
            styles.filledTrack,
            {
              backgroundColor: minimumTrackTintColor,
              width: `${ratio * 100}%`,
            },
          ]}
        />
      </View>

      {/* Thumb */}
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: thumbTintColor,
            left: Math.max(0, thumbPosition - 10),
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  filledTrack: {
    height: '100%',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});

export default Slider;
