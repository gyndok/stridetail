import { Text } from 'react-native';

import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Clients() {
  const t = useTheme();
  return (
    <Screen title="Clients">
      <Text style={{ color: t.colors.inkMuted }}>Nothing scheduled yet.</Text>
    </Screen>
  );
}
