import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";

type SliderProps = {
  style?: any;
  minimumValue?: number;
  maximumValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  step?: number;
  disabled?: boolean;
};

// Web-compatible Slider using HTML input range
export default function Slider({
  style,
  minimumValue = 0,
  maximumValue = 100,
  value = 0,
  onValueChange,
  onSlidingComplete,
  minimumTrackTintColor = "#FFD700",
  maximumTrackTintColor = "rgba(255, 255, 255, 0.2)",
  thumbTintColor = "#FFD700",
  step = 1,
  disabled = false,
}: SliderProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(event.target.value);
      onValueChange?.(newValue);
    },
    [onValueChange]
  );

  const handleMouseUp = useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      const target = event.target as HTMLInputElement;
      const newValue = parseFloat(target.value);
      onSlidingComplete?.(newValue);
    },
    [onSlidingComplete]
  );

  const percentage = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;

  return (
    <View style={[styles.container, style]}>
      <input
        type="range"
        min={minimumValue}
        max={maximumValue}
        value={value}
        step={step}
        onChange={handleChange}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp as any}
        disabled={disabled}
        style={{
          width: "100%",
          height: 40,
          cursor: disabled ? "not-allowed" : "pointer",
          WebkitAppearance: "none",
          appearance: "none",
          background: `linear-gradient(to right, ${minimumTrackTintColor} 0%, ${minimumTrackTintColor} ${percentage}%, ${maximumTrackTintColor} ${percentage}%, ${maximumTrackTintColor} 100%)`,
          borderRadius: 4,
          outline: "none",
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${thumbTintColor};
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${thumbTintColor};
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 40,
    justifyContent: "center",
  },
});
