import { Text, View } from 'react-native';
// eslint-disable-next-line import/no-extraneous-dependencies -- react-native-web is the web renderer expo installs
import { unstable_createElement } from 'react-native-web';

import { useTheme } from './theme';

type Props = {
  label: string;
  /** 'HH:MM' (24-hour wall clock). */
  value: string;
  onChange: (hhmm: string) => void;
};

/**
 * Web resolution of TimeField (Metro platform extension) — see
 * DateField.web.tsx for why. HTML <input type="time"> keeps the same
 * 'HH:MM' wall-clock contract.
 */
export function TimeField({ label, value, onChange }: Props) {
  const t = useTheme();
  const input = unstable_createElement('input', {
    type: 'time',
    'aria-label': label,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: {
      backgroundColor: t.colors.surfaceRaised,
      borderRadius: t.radius.input,
      padding: 14,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: t.colors.line,
      fontSize: 16,
      color: t.colors.ink,
      fontFamily: 'inherit',
    },
  });
  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      {input}
    </View>
  );
}
