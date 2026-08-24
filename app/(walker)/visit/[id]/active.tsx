import { useRouter, type Href } from 'expo-router';
import { Text } from 'react-native';

import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

/**
 * Placeholder so the Task-4 start flow has somewhere to land. Plan 4 Task 5
 * replaces this with the field-mode active-visit screen (events, photos,
 * gated reveal, finish).
 */
export default function ActiveVisit() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Screen title="Active visit">
      <Text style={{ color: t.colors.inkMuted }}>Active visit — Task 5</Text>
      <Button title="Back to Today" variant="ghost" onPress={() => router.replace('/today' as Href)} />
    </Screen>
  );
}
