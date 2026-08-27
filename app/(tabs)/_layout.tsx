import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { House, Wallet, SlidersHorizontal } from "lucide-react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Colors, FontFamily, BorderRadius, Spacing } from "@/constants/theme";

const TABS = [
  { name: "index",    title: "Home",     Icon: House },
  { name: "wallet",   title: "Wallet",   Icon: Wallet },
  { name: "settings", title: "Settings", Icon: SlidersHorizontal },
] as const;

function TreasureTabBar({ state, descriptors: _descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const tab = TABS[index];
        if (!tab) return null;
        const { Icon, title } = tab;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            (navigation as any).navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={title}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
            activeOpacity={0.75}
          >
            <Icon
              size={22}
              color={isFocused ? Colors.primary : Colors.inactive}
              strokeWidth={isFocused ? 2.2 : 1.8}
            />
            <View style={[styles.activeBar, !isFocused && styles.activeBarHidden]} />
            <Text style={[styles.label, { color: isFocused ? Colors.primary : Colors.inactive }]}>
              {title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  activeBar: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  activeBarHidden: {
    backgroundColor: "transparent",
  },
  label: {
    fontFamily: FontFamily.quicksandMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.15,
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TreasureTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"    options={{ title: "Home" }} />
      <Tabs.Screen name="wallet"   options={{ title: "Wallet" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
