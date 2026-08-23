import { Stack } from 'expo-router';

/**
 * Stack nested inside the Clients tab. The Tabs.Screen in app/(owner)/_layout.tsx
 * keeps the name 'clients'; expo-router resolves the directory's index route for
 * the tab and pushes [id]/new (Task 5) within this stack.
 */
export default function ClientsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
