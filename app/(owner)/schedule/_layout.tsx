import { Stack } from 'expo-router';

/**
 * Stack nested inside the Schedule tab (clients/_layout.tsx precedent). The
 * Tabs.Screen in app/(owner)/_layout.tsx keeps the name 'schedule'; expo-router
 * resolves this directory's index route for the tab and pushes new/[id] within
 * this stack.
 */
export default function ScheduleLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
