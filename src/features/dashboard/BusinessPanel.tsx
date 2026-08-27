import { Text } from 'react-native';

import { useTheme } from '@/src/ui/theme';

import { PanelCard } from './PanelCard';

// Plan 8b Task 4 replaces this file wholesale (clients & pets table, services
// menu, billing hub). Only the exported name and default-prop shape must
// survive — OwnerDashboard imports { BusinessPanel } and passes nothing.

export function BusinessPanel() {
  const t = useTheme();
  return (
    <PanelCard title="Business">
      <Text style={{ color: t.colors.inkMuted }}>
        Clients, services, and billing — coming in the next task.
      </Text>
    </PanelCard>
  );
}
