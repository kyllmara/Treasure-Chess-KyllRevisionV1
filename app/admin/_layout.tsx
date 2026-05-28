/**
 * Admin Section Layout
 *
 * Handles routing for all admin screens.
 */

import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="users" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="tournaments" />
      <Stack.Screen name="challenges" />
      <Stack.Screen name="playnow" />
      <Stack.Screen name="vault" />
      <Stack.Screen name="manage-admins" />
      <Stack.Screen name="audit" />
      <Stack.Screen name="support-tickets" />
      <Stack.Screen name="fiat-deposits" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
