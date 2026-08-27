import { Text } from 'react-native';

import { useTheme } from '@/src/ui/theme';

import { PanelCard } from './PanelCard';

// Plan 8b Task 3 replaces this file wholesale (week schedule table + month
// mini-calendar). Only the exported name and default-prop shape must survive —
// OwnerDashboard imports { SchedulePanel } and passes nothing.

export function SchedulePanel() {
  const t = useTheme();
  return (
    <PanelCard title="Schedule">
      <Text style={{ color: t.colors.inkMuted }}>
        Week table and month calendar — coming in the next task.
      </Text>
    </PanelCard>
  );
}
