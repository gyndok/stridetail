import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/src/features/auth/session';

export default function AuthLayout() {
  const { status } = useSession();
  if (status === 'signed-in') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
