import { Text } from 'react-native';

import { useTheme } from '@/src/ui/theme';

import { PanelCard } from './PanelCard';

// Plan 8b Task 2 replaces this file wholesale (pending requests, needs
// attention, out-on-walks-now). Only the exported name and default-prop shape
// must survive — OwnerDashboard imports { OperationsPanel } and passes nothing.

export function OperationsPanel() {
  const t = useTheme();
  return (
    <PanelCard title="Operations">
      <Text style={{ color: t.colors.inkMuted }}>
        Requests, needs attention, and live walks — coming in the next task.
      </Text>
    </PanelCard>
  );
}
