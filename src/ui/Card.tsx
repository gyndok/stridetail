import { PropsWithChildren } from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.card, padding: t.space.lg,
          shadowColor: t.colors.line, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
