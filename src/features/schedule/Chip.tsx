import { Pressable, Text } from 'react-native';

import { useTheme } from '@/src/ui/theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/** Small selectable pill — filter chips, weekday chips, pet chips. */
export function Chip({ label, selected, onPress }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: t.radius.pill,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.line,
        backgroundColor: selected ? t.colors.primary : t.colors.surfaceRaised,
        paddingHorizontal: t.space.md,
        paddingVertical: t.space.xs + 2,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? t.colors.onPrimary : t.colors.ink,
          fontSize: 13,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
