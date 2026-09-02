import { Linking, Pressable, Text } from 'react-native';

import { useTheme } from '@/src/ui/theme';

/**
 * NATIVE fallback for a report video clip (wish list #7): the report page is
 * really a web page (stridetail.app/report/<token>) where VideoPlayer.web.tsx
 * renders a real <video>; if the route ever renders natively, opening the
 * signed URL hands the clip to the system player — no native video module in
 * the binary, so this stays OTA-safe.
 */
export function VideoPlayer({ uri }: { uri: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void Linking.openURL(uri)}
      style={{
        padding: t.space.md,
        borderRadius: t.radius.input,
        backgroundColor: t.colors.surfaceRaised,
      }}
    >
      <Text style={{ color: t.colors.primary, fontWeight: '700' }}>▶ Watch video</Text>
    </Pressable>
  );
}
