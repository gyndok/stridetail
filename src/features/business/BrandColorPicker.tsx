import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/src/ui/theme';

import { BRAND_COLORS, brandColorLabel } from './branding';

/**
 * Curated brand-color swatches (2026-08-30) — shared by the create-business
 * flow and the owner Settings card. Tap to select; the chosen swatch wears a
 * ring and its name is read out below. Selection semantics (save-on-tap vs
 * save-on-submit) belong to the caller via onSelect.
 */
export function BrandColorPicker({
  value,
  onSelect,
  disabled,
}: {
  value: string;
  onSelect: (color: string) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
        {BRAND_COLORS.map((c) => {
          const selected = c.hex === value;
          return (
            <Pressable
              key={c.hex}
              accessibilityRole="button"
              accessibilityLabel={`Brand color ${c.label}`}
              accessibilityState={{ selected }}
              disabled={disabled}
              onPress={() => onSelect(c.hex)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: c.hex,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: selected ? 3 : 0,
                borderColor: t.colors.ink,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {selected ? <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: t.colors.inkMuted, fontSize: 13 }}>
        {brandColorLabel(value) ?? 'Custom color'} — shows on your report pages, invoices, portal,
        and emails.
      </Text>
    </View>
  );
}
