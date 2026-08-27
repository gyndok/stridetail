// Plan 8b Task 1 — the Today width gate, as a pure function so the today.tsx
// wiring stays a one-liner and the decision is unit-testable.
//
// 1024 is the dashboard's own threshold, deliberately ABOVE the OwnerRail's
// DESKTOP_MIN_WIDTH (900): between 900 and 1023 the rail is docked but the
// multi-panel dashboard would be cramped, so mobile Today renders beside the
// rail there (plan: "below 1024 — and always on native — untouched").

export const DASHBOARD_MIN_WIDTH = 1024;

export type TodayVariant = 'dashboard' | 'mobile';

/** Dashboard only on web at >= 1024 px; mobile Today everywhere else. */
export function decideTodayVariant(platform: string, width: number): TodayVariant {
  return platform === 'web' && width >= DASHBOARD_MIN_WIDTH ? 'dashboard' : 'mobile';
}
