/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Treasure Chess brand colors
        gold: {
          DEFAULT: "#FFD700",
          dark: "#FFA500",
        },
        purple: {
          dark: "#0F0F1E",
          DEFAULT: "#1A1A2E",
          light: "#9B7EC8",
        },
        // Board themes
        board: {
          light: "#FFFFFF",
          dark: "#9B7EC8",
        },
      },
      fontFamily: {
        // Plus Jakarta Sans - Primary UI font
        sans: ["PlusJakartaSans-Regular"],
        "sans-medium": ["PlusJakartaSans-Medium"],
        "sans-semibold": ["PlusJakartaSans-SemiBold"],
        "sans-bold": ["PlusJakartaSans-Bold"],
        "sans-extrabold": ["PlusJakartaSans-ExtraBold"],
        // Legacy aliases for backwards compatibility
        cabin: ["PlusJakartaSans-Regular"],
        "cabin-medium": ["PlusJakartaSans-Medium"],
        "cabin-semibold": ["PlusJakartaSans-SemiBold"],
        "cabin-bold": ["PlusJakartaSans-Bold"],
        // Playfair Display - Serif font for branding
        serif: ["PlayfairDisplay-Bold"],
        "serif-black": ["PlayfairDisplay-Black"],
        // Barlow Condensed - Display font
        barlow: ["BarlowCondensed-Medium"],
        "barlow-bold": ["BarlowCondensed-Bold"],
      },
    },
  },
  plugins: [],
};
