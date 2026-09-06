import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme';

/** Web viewports at least this wide get the desktop treatment (rail + week grid). */
export const DESKTOP_MIN_WIDTH = 900;

export type RailItem = {
  key: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

/**
 * Desktop left rail (Plan 4 Task 8): the owner Tabs' tab bar, re-skinned as a
 * vertical sidebar for web >= 900 px. Purely presentational — the layout maps
 * the navigator's tabBar props (state/descriptors/navigation) into RailItems,
 * so this component needs no react-navigation types. Rendered by the Tabs
 * navigator itself via `tabBarPosition: 'left'` + a custom `tabBar`, keeping
 * the route structure and tab state exactly as on mobile.
 */
export function OwnerRail({ businessName, items }: { businessName: string; items: RailItem[] }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: 232,
        backgroundColor: t.colors.surfaceRaised,
        borderRightWidth: 1,
        borderRightColor: t.colors.line,
        paddingVertical: t.space.xl,
        paddingHorizontal: t.space.md,
        gap: t.space.xs,
      }}
    >
      <Text
        style={[t.type.title, { color: t.colors.ink, paddingHorizontal: t.space.md, marginBottom: t.space.lg }]}
        numberOfLines={2}
      >
        {businessName}
      </Text>
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityState={{ selected: item.active }}
          onPress={item.onPress}
          style={({ pressed }) => ({
            borderRadius: t.radius.input,
            paddingVertical: t.space.md,
            paddingHorizontal: t.space.md,
            backgroundColor: item.active ? t.colors.surface : 'transparent',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              color: item.active ? t.colors.primary : t.colors.inkMuted,
              fontSize: 15,
              fontWeight: item.active ? '800' : '600',
            }}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
