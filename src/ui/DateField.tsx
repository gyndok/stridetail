import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { dateToYmd, ymdToDate, ymdToDisplay } from './datetime';
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
 * Native calendar field. Value in/out is a plain 'YYYY-MM-DD' wall-clock
 * string; Date objects live only inside the picker widget (see datetime.ts).
 * iOS: tapping toggles an inline calendar below the field. Android: tapping
 * opens the native dialog imperatively (the documented recommended API).
 */
export function DateField({ label, value, onChange, placeholder, minimumDate, onClear }: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const pickerValue = value ? ymdToDate(value) : (minimumDate ?? new Date());

  const onPick = (_event: DateTimePickerChangeEvent, date: Date) => {
    setOpen(false);
    onChange(dateToYmd(date));
  };

  const onPress = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode: 'date',
        minimumDate,
        onValueChange: onPick,
      });
    } else {
      setOpen((cur) => !cur);
    }
  };

  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={{
            flex: 1, backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.input,
            padding: 14, borderWidth: 1, borderColor: t.colors.line,
          }}
        >
          <Text style={{ fontSize: 16, color: value ? t.colors.ink : t.colors.inkMuted }}>
            {value ? ymdToDisplay(value) : (placeholder ?? 'Pick a date')}
          </Text>
        </Pressable>
        {value && onClear ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={onClear}>
            <Text style={{ color: t.colors.inkMuted, fontSize: 14, fontWeight: '700' }}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="inline"
          minimumDate={minimumDate}
          accentColor={t.colors.primary}
          onValueChange={onPick}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
