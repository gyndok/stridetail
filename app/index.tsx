import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { useTheme } from '@/src/ui/theme';

export default function Index() {
  const t = useTheme();
  const { status } = useSession();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  return <Redirect href="/onboarding/create-business" />;
}
