import { fireEvent, render } from '@testing-library/react-native';

import { ThemeProvider } from '../../../ui/theme';
import type { ReportPayload } from '../api';
import { RouteCard } from '../RouteCard';

// Plan 7b Task 2: the route card prefers the pre-rendered static map (payload
// mapUrl, signed URL from report-public) and falls back to the existing
// route sketch — same payload, no refetch — when the map is absent or the
// image fails to load. Under jest-expo the platform is native, so the sketch
// fallback renders as the "Route: X mi recorded" text line.

const report = (over: Partial<ReportPayload> = {}): ReportPayload => ({
  business: { name: 'Happy Paws', brandColor: '#E8642C', logoUrl: null },
  businessTz: 'America/Chicago',
  summary: {
    petNames: ['Biscuit'],
    serviceName: 'Walk',
    scheduledStart: '2026-09-02T15:00:00Z',
    scheduledEnd: '2026-09-02T15:30:00Z',
    startedAt: '2026-09-02T15:02:00Z',
    finishedAt: '2026-09-02T15:34:00Z',
    durationMin: 32,
    distanceM: 500,
  },
  timeline: [],
  route: [
    { lat: 29.76, lng: -95.36 },
    { lat: 29.761, lng: -95.361 },
  ],
  invoice: null,
  ...over,
});

const wrap = (r: ReportPayload) => (
  <ThemeProvider>
    <RouteCard report={r} />
  </ThemeProvider>
);

test('payload with mapUrl renders the map image and attribution', async () => {
  const { getByTestId, getByText, queryByText } = await render(
    wrap(report({ mapUrl: 'https://cdn.example/map.png?sig=abc', mapAttribution: '© Mapbox © OpenStreetMap' })),
  );
  const img = getByTestId('report-map');
  expect(img.props.source).toEqual({ uri: 'https://cdn.example/map.png?sig=abc' });
  expect(getByText('© Mapbox © OpenStreetMap')).toBeTruthy();
  // map replaces the sketch, not renders beside it
  expect(queryByText(/Route: .* recorded/)).toBeNull();
});

test('payload without mapUrl falls back to the route sketch', async () => {
  const { getByText, queryByTestId, queryByText } = await render(wrap(report()));
  expect(queryByTestId('report-map')).toBeNull();
  expect(getByText('Route: 0.31 mi recorded')).toBeTruthy();
  expect(queryByText('© Mapbox © OpenStreetMap')).toBeNull();
});

test('image load failure flips to the sketch fallback without a refetch', async () => {
  const { getByTestId, getByText, queryByTestId } = await render(
    wrap(report({ mapUrl: 'https://cdn.example/map.png?sig=expired', mapAttribution: '© Mapbox © OpenStreetMap' })),
  );
  await fireEvent(getByTestId('report-map'), 'error');
  expect(queryByTestId('report-map')).toBeNull();
  expect(getByText('Route: 0.31 mi recorded')).toBeTruthy();
});

test('renders nothing when there is no map, no route, and no distance', async () => {
  const { toJSON } = await render(wrap(report({ route: [], summary: { ...report().summary, distanceM: null } })));
  expect(toJSON()).toBeNull();
});
