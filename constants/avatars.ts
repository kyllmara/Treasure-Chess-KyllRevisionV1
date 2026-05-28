/**
 * Avatar Configuration Constants
 *
 * Provides avatar configurations and utilities for the app.
 */

import { ImageSourcePropType } from "react-native";

// Avatar image sources
const AVATAR_IMAGES: Record<number, ImageSourcePropType> = {
  0: require("@/assets/images/avatars/robot.png"), // AI/Robot avatar
  1: require("@/assets/images/avatars/1.png"),
  2: require("@/assets/images/avatars/2.png"),
  3: require("@/assets/images/avatars/3.png"),
  4: require("@/assets/images/avatars/4.png"),
  5: require("@/assets/images/avatars/5.png"),
  6: require("@/assets/images/avatars/6.png"),
  7: require("@/assets/images/avatars/7.png"),
  8: require("@/assets/images/avatars/8.png"),
  9: require("@/assets/images/avatars/9.png"),
  10: require("@/assets/images/avatars/10.png"),
  11: require("@/assets/images/avatars/11.png"),
  12: require("@/assets/images/avatars/12.png"),
  13: require("@/assets/images/avatars/13.png"),
  14: require("@/assets/images/avatars/14.png"),
  15: require("@/assets/images/avatars/15.png"),
  16: require("@/assets/images/avatars/16.png"),
  17: require("@/assets/images/avatars/17.png"),
  18: require("@/assets/images/avatars/18.png"),
  19: require("@/assets/images/avatars/19.png"),
  20: require("@/assets/images/avatars/20.png"),
  21: require("@/assets/images/avatars/21.png"),
  22: require("@/assets/images/avatars/22.png"),
  23: require("@/assets/images/avatars/23.png"),
  24: require("@/assets/images/avatars/24.png"),
  25: require("@/assets/images/avatars/25.png"),
  26: require("@/assets/images/avatars/26.png"),
  27: require("@/assets/images/avatars/27.png"),
  28: require("@/assets/images/avatars/28.png"),
  29: require("@/assets/images/avatars/29.png"),
  30: require("@/assets/images/avatars/30.png"),
};

// Avatar names/labels
const AVATAR_NAMES: Record<number, string> = {
  0: "Robot",
  1: "Knight",
  2: "Wizard",
  3: "Warrior",
  4: "Mage",
  5: "Archer",
  6: "Rogue",
  7: "Paladin",
  8: "Cleric",
  9: "Bard",
  10: "Monk",
  11: "Druid",
  12: "Ranger",
  13: "Barbarian",
  14: "Sorcerer",
  15: "Warlock",
  16: "Fighter",
  17: "Necromancer",
  18: "Alchemist",
  19: "Assassin",
  20: "Samurai",
  21: "Viking",
  22: "Pirate",
  23: "Ninja",
  24: "Gladiator",
  25: "Shaman",
  26: "Templar",
  27: "Crusader",
  28: "Berserker",
  29: "Champion",
  30: "Legend",
};

// Avatar configuration interface
export interface AvatarConfig {
  index: number;
  name: string;
  source: ImageSourcePropType;
}

/**
 * Get avatar configuration by index
 */
export function getAvatarConfig(index: number): AvatarConfig {
  const validIndex = AVATAR_IMAGES[index] ? index : 1;
  return {
    index: validIndex,
    name: AVATAR_NAMES[validIndex] || `Avatar ${validIndex}`,
    source: AVATAR_IMAGES[validIndex],
  };
}

/**
 * Get avatar image source by index
 */
export function getAvatarSource(index: number): ImageSourcePropType {
  return AVATAR_IMAGES[index] || AVATAR_IMAGES[1];
}

/**
 * Get all available avatar indices (excluding robot)
 */
export const AVATAR_INDICES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
];

/**
 * Total number of avatars available
 */
export const AVATAR_COUNT = 30;

/**
 * Robot avatar index (used for AI opponents)
 */
export const ROBOT_AVATAR_INDEX = 0;
