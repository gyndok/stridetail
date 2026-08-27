import { useWindowDimensions, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

import { BusinessPanel } from './BusinessPanel';
import { KpiRow } from './KpiRow';
import { useDashboardKpis } from './kpis';
import { OperationsPanel } from './OperationsPanel';
import { SchedulePanel } from './SchedulePanel';

// Plan 8b Tasks 1+5 — the desktop dashboard, composed to the mockup's
// hierarchy. Rendered by (owner)/today.tsx on web at >= 1024 px (gate.ts); the
// OwnerRail is already docked left, so this is purely the content column:
//
//   KPI row (full width)
//   Operations row (requests · needs attention · out on walks) — prominent
//   Schedule column (week TABLE + month calendar) | Business column  ~2:1
//
// The schedule column is the wide one because the week table is the widest
// content; at >= 1600 the table and the month calendar sit side by side
// inside it, below that they stack (table keeps the full column width).

/** Operations cards go three-across at this width; two-across below it. */
export const THREE_COLUMN_MIN_WIDTH = 1280;
/** Schedule table + month calendar sit side by side from this width up. */
export const SCHEDULE_SPLIT_MIN_WIDTH = 1600;

export type DashboardLayout = {
  /** Operations cards per row (requests / attention / live). */
  opsColumns: 2 | 3;
  /** 'row' = week table and month calendar side by side in the schedule slot. */
  schedule: 'row' | 'column';
};

/** Pure width -> composition decision (jest-tested like gate.ts). */
export function dashboardLayout(width: number): DashboardLayout {
  return {
    opsColumns: width >= THREE_COLUMN_MIN_WIDTH ? 3 : 2,
    schedule: width >= SCHEDULE_SPLIT_MIN_WIDTH ? 'row' : 'column',
  };
}

export function OwnerDashboard() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const tz =
    memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;
  const kpis = useDashboardKpis(businessId, tz);
  const layout = dashboardLayout(width);
  return (
    <Screen title="Today">
      <KpiRow kpis={kpis.data} />
      <OperationsPanel columns={layout.opsColumns} />
      {/* flexBasis under 100% keeps both slots on one row; flexGrow 2:1 hands
          the remainder to the schedule slot; minWidth 0 lets rows truncate
          instead of forcing the page to scroll sideways. */}
      <View
        testID="dashboard-main-row"
        style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'flex-start' }}
      >
        <View
          testID="dashboard-schedule-slot"
          style={{ flexGrow: 2, flexBasis: '58%', minWidth: 0 }}
        >
          <SchedulePanel layout={layout.schedule} />
        </View>
        <View
          testID="dashboard-business-slot"
          style={{ flexGrow: 1, flexBasis: '32%', minWidth: 0 }}
        >
          <BusinessPanel />
        </View>
      </View>
    </Screen>
  );
}
