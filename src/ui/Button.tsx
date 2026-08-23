import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from './theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.colors.primary : variant === 'secondary' ? t.colors.surfaceRaised : 'transparent';
  const fg = variant === 'primary' ? t.colors.onPrimary : t.colors.primary;
  const inactive = !!loading || !!disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderRadius: t.radius.pill, opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.label, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '800' },
});
