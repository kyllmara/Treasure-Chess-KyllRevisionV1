import React from 'react';
import { Image } from 'react-native';
import Svg, { Path, Circle, G, Rect } from 'react-native-svg';
import type { PieceStyle } from '@/types';

// Unity 3D piece PNG assets
const UNITY_PIECES = {
  w: {
    k: require('@/assets/images/pieces/white/K.png'),
    q: require('@/assets/images/pieces/white/Q.png'),
    r: require('@/assets/images/pieces/white/R.png'),
    b: require('@/assets/images/pieces/white/B.png'),
    n: require('@/assets/images/pieces/white/N.png'),
    p: require('@/assets/images/pieces/white/P.png'),
  },
  b: {
    k: require('@/assets/images/pieces/black/k.png'),
    q: require('@/assets/images/pieces/black/q.png'),
    r: require('@/assets/images/pieces/black/r.png'),
    b: require('@/assets/images/pieces/black/b.png'),
    n: require('@/assets/images/pieces/black/n.png'),
    p: require('@/assets/images/pieces/black/p.png'),
  },
};

interface PieceProps {
  size: number;
  color: 'w' | 'b';
  style: PieceStyle;
}

export const King = ({ size, color, style }: PieceProps) => {
  if (style === 'unity') {
    return (
      <Image
        source={UNITY_PIECES[color].k}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  const fillColor = color === 'w' ? '#FFFFFF' : '#2C2C2C';
  const strokeColor = color === 'w' ? '#2C2C2C' : '#FFFFFF';

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <G fill={fillColor} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 22.5,11.63 L 22.5,6" strokeLinejoin="miter" />
        <Path d="M 20,8 L 25,8" strokeLinejoin="miter" />
        <Path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" fill={fillColor} />
        <Path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37" fill={fillColor} />
        <Path d="M 12.5,30 C 18,27 27,27 32.5,30" fill="none" />
        <Path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" fill="none" />
        <Path d="M 12.5,37 C 18,34 27,34 32.5,37" fill="none" />
      </G>
    </Svg>
  );
};

export const Queen = ({ size, color, style }: PieceProps) => {
  if (style === 'unity') {
    return (
      <Image
        source={UNITY_PIECES[color].q}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  const fillColor = color === 'w' ? '#FFFFFF' : '#2C2C2C';
  const strokeColor = color === 'w' ? '#2C2C2C' : '#FFFFFF';

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <G fill={fillColor} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="6" cy="12" r="2.75" />
        <Circle cx="14" cy="9" r="2.75" />
        <Circle cx="22.5" cy="8" r="2.75" />
        <Circle cx="31" cy="9" r="2.75" />
        <Circle cx="39" cy="12" r="2.75" />
        <Path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z" strokeLinecap="butt" fill={fillColor} />
        <Path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 30,24.5 15,24.5 9,26 z" strokeLinecap="butt" />
        <Path d="M 11,38.5 A 35,35 1 0 0 34,38.5" fill="none" strokeLinecap="butt" />
        <Path d="M 11,29 A 35,35 1 0 1 34,29" fill="none" />
        <Path d="M 12.5,31.5 L 32.5,31.5" fill="none" />
        <Path d="M 11.5,34.5 A 35,35 1 0 0 33.5,34.5" fill="none" strokeLinecap="butt" />
        <Path d="M 10.5,37.5 A 35,35 1 0 0 34.5,37.5" fill="none" strokeLinecap="butt" />
      </G>
    </Svg>
  );
};

export const Rook = ({ size, color, style }: PieceProps) => {
  if (style === 'unity') {
    return (
      <Image
        source={UNITY_PIECES[color].r}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  const fillColor = color === 'w' ? '#FFFFFF' : '#2C2C2C';
  const strokeColor = color === 'w' ? '#2C2C2C' : '#FFFFFF';

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <G fill={fillColor} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z" strokeLinecap="butt" />
        <Path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z" strokeLinecap="butt" />
        <Path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" strokeLinecap="butt" />
        <Path d="M 34,14 L 31,17 L 14,17 L 11,14" />
        <Path d="M 31,17 L 31,29.5 L 14,29.5 L 14,17" strokeLinecap="butt" strokeLinejoin="miter" />
        <Path d="M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5" />
        <Path d="M 11,14 L 34,14" fill="none" strokeLinejoin="miter" />
      </G>
    </Svg>
  );
};

export const Bishop = ({ size, color, style }: PieceProps) => {
  if (style === 'unity') {
    return (
      <Image
        source={UNITY_PIECES[color].b}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  const fillColor = color === 'w' ? '#FFFFFF' : '#2C2C2C';
  const strokeColor = color === 'w' ? '#2C2C2C' : '#FFFFFF';

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <G fill={fillColor} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z" />
        <Path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z" />
        <Path d="M 25 8 A 2.5 2.5 0 1 1 20,8 A 2.5 2.5 0 1 1 25 8 z" />
        <Path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" fill="none" strokeLinejoin="miter" />
      </G>
    </Svg>
  );
};

export const Knight = ({ size, color, style }: PieceProps) => {
  if (style === 'unity') {
    return (
      <Image
        source={UNITY_PIECES[color].n}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  const fillColor = color === 'w' ? '#FFFFFF' : '#2C2C2C';
  const strokeColor = color === 'w' ? '#2C2C2C' : '#FFFFFF';

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <G fill={fillColor} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill={fillColor} />
        <Path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" fill={fillColor} />
        <Path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill={strokeColor} stroke={strokeColor} />
        <Path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill={strokeColor} stroke={strokeColor} />
        <Path d="M 24.55,10.4 L 24.1,11.85 L 24.6,12 C 27.75,13 30.25,14.49 32.5,18.75 C 34.75,23.01 35.75,29.06 35.25,39 L 35.2,39.5 L 37.45,39.5 L 37.5,39 C 38,28.94 36.62,22.15 34.25,17.66 C 31.88,13.17 28.46,11.02 25.06,10.5 L 24.55,10.4 z" fill={strokeColor} stroke="none" />
      </G>
    </Svg>
  );
};

export const Pawn = ({ size, color, style }: PieceProps) => {
  if (style === 'unity') {
    return (
      <Image
        source={UNITY_PIECES[color].p}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  const fillColor = color === 'w' ? '#FFFFFF' : '#2C2C2C';
  const strokeColor = color === 'w' ? '#2C2C2C' : '#FFFFFF';

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <G fill={fillColor} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 22.5,9 C 19.5,9 17,11.5 17,14.5 C 17,16.5 18,18 18,18 C 15,19 14,21 11,22.5 C 11,22.5 11.5,25 11.5,29.5 C 11.5,32.5 11.5,32.5 12,33.5 C 12,33.5 13.5,34.5 16,34.5 C 16,34.5 17,35.5 17,36.5 C 17,37.5 16,38 16,38 L 29,38 C 29,38 28,37.5 28,36.5 C 28,35.5 29,34.5 29,34.5 C 31.5,34.5 33,33.5 33,33.5 C 33.5,32.5 33.5,32.5 33.5,29.5 C 33.5,25 34,22.5 34,22.5 C 31,21 30,19 27,18 C 27,18 28,16.5 28,14.5 C 28,11.5 25.5,9 22.5,9 z" fill={fillColor} />
      </G>
    </Svg>
  );
};

interface ChessPieceComponentProps {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
  size: number;
  style: string;
}

export const ChessPieceComponent = ({ type, color, size, style }: ChessPieceComponentProps) => {
  // Normalize style - treat anything other than "classic" as "unity"
  const pieceStyle: PieceStyle = style === 'classic' ? 'classic' : 'unity';

  switch (type) {
    case 'k':
      return <King size={size} color={color} style={pieceStyle} />;
    case 'q':
      return <Queen size={size} color={color} style={pieceStyle} />;
    case 'r':
      return <Rook size={size} color={color} style={pieceStyle} />;
    case 'b':
      return <Bishop size={size} color={color} style={pieceStyle} />;
    case 'n':
      return <Knight size={size} color={color} style={pieceStyle} />;
    case 'p':
      return <Pawn size={size} color={color} style={pieceStyle} />;
    default:
      return null;
  }
};
