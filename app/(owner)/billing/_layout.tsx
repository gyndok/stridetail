import { Stack } from 'expo-router';

/**
 * Stack nested inside the Billing tab (clients/schedule _layout precedent).
 * The Tabs.Screen in app/(owner)/_layout.tsx keeps the name 'billing';
 * expo-router resolves this directory's index route for the tab and pushes
 * new/[id]/deposits within this stack.
 */
export default function BillingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
