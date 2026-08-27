import { View } from 'react-native';

import { useTheme } from '@/src/ui/theme';

// Plan 8b Task 5 — the dashboard's one loading treatment: a few quiet bars in
// the panel body (KpiRow keeps its own height-stable shells). Deliberately
// plain — token colors only, no animation, no shimmer dependency — matching
// the repo's low-key "Loading…" convention while holding the card's shape.

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View accessibilityLabel="Loading" style={{ gap: t.space.sm }}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            height: 12,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.line,
            width: i % 2 === 0 ? '85%' : '60%',
          }}
        />
      ))}
    </View>
  );
}
