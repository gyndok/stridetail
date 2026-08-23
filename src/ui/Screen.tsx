import { PropsWithChildren } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export function Screen({ title, children }: PropsWithChildren<{ title?: string }>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + t.space.lg, paddingBottom: insets.bottom + t.space.xl,
          paddingHorizontal: t.space.lg, gap: t.space.md }}
        keyboardShouldPersistTaps="handled"
        // Keep the content (e.g. a form's submit button) reachable while the
        // keyboard is up, and let a downward drag dismiss the keyboard.
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        {title ? <Text style={[t.type.hero, { color: t.colors.ink }]}>{title}</Text> : null}
        {children}
      </ScrollView>
    </View>
  );
}
