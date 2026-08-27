import { Pressable, Text, View } from 'react-native';
// eslint-disable-next-line import/no-extraneous-dependencies -- react-native-web is the web renderer expo installs
import { unstable_createElement } from 'react-native-web';

import { dateToYmd } from './datetime';
import { useTheme } from './theme';

type Props = {
  label: string;
  /** 'YYYY-MM-DD', or '' when unset (renders the placeholder). */
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  /** When set and a value exists, shows a Clear affordance that calls this. */
  onClear?: () => void;
};

/**
 * Web resolution of DateField (Metro platform extension): the community
 * datetimepicker has NO web implementation, so the native file's tap-to-open
 * silently does nothing in a browser — found live in Checkpoint 8's request
 * form. A plain HTML <input type="date"> is the platform-native calendar
 * on web; value in/out stays the same 'YYYY-MM-DD' wall-clock string.
 */
export function DateField({ label, value, onChange, placeholder, minimumDate, onClear }: Props) {
  const t = useTheme();
  const input = unstable_createElement('input', {
    type: 'date',
    'aria-label': label,
    value,
    min: minimumDate ? dateToYmd(minimumDate) : undefined,
    placeholder: placeholder ?? 'Pick a date',
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: {
      flex: 1,
      backgroundColor: t.colors.surfaceRaised,
      borderRadius: t.radius.input,
      padding: 14,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: t.colors.line,
      fontSize: 16,
      color: value ? t.colors.ink : t.colors.inkMuted,
      fontFamily: 'inherit',
    },
  });
  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
        {input}
        {value && onClear ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={onClear}>
            <Text style={{ color: t.colors.inkMuted, fontSize: 14, fontWeight: '700' }}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
