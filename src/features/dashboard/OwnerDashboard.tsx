import { useWindowDimensions, View, type DimensionValue } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

import { BusinessPanel } from './BusinessPanel';
import { KpiRow } from './KpiRow';
import { useDashboardKpis } from './kpis';
import { OperationsPanel } from './OperationsPanel';
import { SchedulePanel } from './SchedulePanel';

// Plan 8b Task 1 — the desktop dashboard SHELL. Rendered by (owner)/today.tsx
// on web at >= 1024 px (gate.ts); the OwnerRail is already docked left by the
// (owner) layout, so this is purely the content column.
//
// Panel slots are self-contained sibling files (OperationsPanel /
// SchedulePanel / BusinessPanel) that Tasks 2-4 replace wholesale and in
// parallel — this file only composes them, so those tasks never touch a
// shared file. Task 5 refines the grid per the mockup's hierarchy.

/** Three columns on wide desktop, two in the 1024-1279 band. */
export const THREE_COLUMN_MIN_WIDTH = 1280;

export function OwnerDashboard() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const tz =
    memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;
  const kpis = useDashboardKpis(businessId, tz);
  // flexBasis under 50%/33% forces the wrap at two/three per row; flexGrow
  // fills the remainder so a short last row still spans the width.
  const basis: DimensionValue = width >= THREE_COLUMN_MIN_WIDTH ? '31%' : '48%';
  const slot = { flexGrow: 1, flexBasis: basis };
  return (
    <Screen title="Today">
      <KpiRow kpis={kpis.data} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, alignItems: 'flex-start' }}>
        <View style={slot}>
          <OperationsPanel />
        </View>
        <View style={slot}>
          <SchedulePanel />
        </View>
        <View style={slot}>
          <BusinessPanel />
        </View>
      </View>
    </Screen>
  );
}
