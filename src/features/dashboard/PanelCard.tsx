import { PropsWithChildren } from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';

import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

// Plan 8b Task 1 — shared dashboard panel primitive. Tasks 2-4 wrap their
// panel bodies in this so every dashboard card carries the same header
// anatomy: title left, optional deep-link action right, children below.

export type PanelAction = { label: string; onPress: () => void };

export function PanelCard({
  title,
  action,
  style,
  children,
}: PropsWithChildren<{ title: string; action?: PanelAction; style?: ViewStyle }>) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.space.md, ...style }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.space.sm,
        }}
      >
        <Text style={[t.type.title, { color: t.colors.ink, fontSize: 18 }]}>{title}</Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={action.onPress}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: t.colors.primary, fontWeight: '700' }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}
