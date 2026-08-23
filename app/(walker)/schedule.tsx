import { Text } from 'react-native';

import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Schedule() {
  const t = useTheme();
  return (
    <Screen title="Schedule">
      <Text style={{ color: t.colors.inkMuted }}>Nothing scheduled yet.</Text>
    </Screen>
  );
}
