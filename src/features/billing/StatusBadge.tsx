import { Text, View } from 'react-native';

import { useTheme, type Theme } from '@/src/ui/theme';

import type { ChipTone } from './money';

/** statusChip tone -> token color (greens for paid, per Round 0). */
export function toneColor(tone: ChipTone, t: Theme): string {
  if (tone === 'green') return t.colors.green;
  if (tone === 'danger') return t.colors.danger;
  if (tone === 'warning') return t.colors.warning;
  if (tone === 'muted') return t.colors.inkMuted;
  return t.colors.ink;
}

/**
 * Small outlined status pill (invoice list/detail, deposit ledger). Extracted
 * from the Task 3 invoice list so the Task 4 screens don't re-inline it.
 */
export function StatusBadge({ label, tone }: { label: string; tone: ChipTone }) {
  const t = useTheme();
  const color = toneColor(tone, t);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: color,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space.sm,
        paddingVertical: t.space.xs / 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
