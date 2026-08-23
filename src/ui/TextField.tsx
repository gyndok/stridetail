import { Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from './theme';

type Props = TextInputProps & { label: string; error?: string };

export function TextField({ label, error, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.inkMuted}
        style={[
          { backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.input, padding: 14,
            fontSize: 16, color: t.colors.ink, borderWidth: 1, borderColor: error ? t.colors.danger : t.colors.line },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={{ color: t.colors.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}
