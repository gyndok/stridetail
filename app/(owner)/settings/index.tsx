import { useRouter, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { SettingsScreen } from '@/src/features/settings/SettingsScreen';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

/** Owner settings: the shared screen plus the owner-only Services link. */
export default function OwnerSettings() {
  const t = useTheme();
  const router = useRouter();
  return (
    <SettingsScreen
      extra={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/services' as Href)}
        >
          <Card>
            <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Services</Text>
            <Text style={{ color: t.colors.inkMuted }}>
              Manage the service catalog, durations, and prices
            </Text>
          </Card>
        </Pressable>
      }
    />
  );
}
