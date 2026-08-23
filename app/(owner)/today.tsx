import { Text } from 'react-native';

import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Today() {
  const t = useTheme();
  return (
    <Screen title="Today">
      <Text style={{ color: t.colors.inkMuted }}>Nothing scheduled yet.</Text>
    </Screen>
  );
}
