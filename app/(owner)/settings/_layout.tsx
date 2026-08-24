import { Stack } from 'expo-router';

/**
 * Stack nested inside the Settings tab (same pattern as the Clients tab).
 * The Tabs.Screen in app/(owner)/_layout.tsx keeps the name 'settings'; the
 * directory's index resolves for the tab and services.tsx pushes within this
 * stack without the default native header.
 */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
