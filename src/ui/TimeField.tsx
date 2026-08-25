import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { dateToHhmm, hhmmToDate, hhmmToDisplay } from './datetime';
import { useTheme } from './theme';

type Props = {
  label: string;
  /** 'HH:MM' (24-hour wall clock). */
  value: string;
  onChange: (hhmm: string) => void;
};

/**
 * Native time field. Value in/out is a plain 'HH:MM' wall-clock string; Date
 * objects live only inside the picker widget (see datetime.ts). iOS: tapping
 * toggles an inline spinner below the field (it stays open while scrolling —
 * tap the field again to close). Android: tapping opens the native dialog.
 */
export function TimeField({ label, value, onChange }: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const pickerValue = hhmmToDate(value);

  const onPress = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode: 'time',
        onValueChange: (_event: DateTimePickerChangeEvent, date: Date) => onChange(dateToHhmm(date)),
      });
    } else {
      setOpen((cur) => !cur);
    }
  };

  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{
          backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.input,
          padding: 14, borderWidth: 1, borderColor: t.colors.line,
        }}
      >
        <Text style={{ fontSize: 16, color: t.colors.ink }}>{hhmmToDisplay(value)}</Text>
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          display="spinner"
          themeVariant="light"
          onValueChange={(_event: DateTimePickerChangeEvent, date: Date) => onChange(dateToHhmm(date))}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
