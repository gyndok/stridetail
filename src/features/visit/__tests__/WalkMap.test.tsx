import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { loadMaps } from '@/src/lib/maps';
import { ThemeProvider } from '@/src/ui/theme';

import { WalkMap } from '../WalkMap';

// Plan 7b Task 3: WalkMap is the ONE shared map card for the live walk screen
// and the completed visit detail. When src/lib/maps cannot deliver the native
// module (old binary via OTA, or web) it renders the fallback — exactly what
// those screens showed before this task. When the module is present it renders
// MapView + route polyline + marker pins reusing the static-map marker art.

jest.mock('@/src/lib/maps', () => ({ loadMaps: jest.fn() }));
const loadMapsMock = loadMaps as jest.Mock;

// Pass-through stubs in the react-native-svg-mock style (jest.setup.ts):
// render as Views so props are inspectable and children mount.
const stub = (name: string) => {
  const C = (props: object) => <View {...props} />;
  C.displayName = name;
  return C;
};
const fakeMaps = {
  MapView: stub('MapView'),
  Marker: stub('Marker'),
  Polyline: stub('Polyline'),
};

const pt = (t: number, lat: number, lng: number) => ({ t, lat, lng });
const track = [pt(0, 29.76, -95.36), pt(10_000, 29.761, -95.361), pt(20_000, 29.762, -95.362)];

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

beforeEach(() => loadMapsMock.mockReturnValue(fakeMaps));

test('renders the fallback when the maps module is unavailable', async () => {
  loadMapsMock.mockReturnValue(null);
  const { getByText, queryByTestId } = await render(
    wrap(<WalkMap track={track} events={[]} mode="live" fallback={<Text>no map here</Text>} />),
  );
  expect(getByText('no map here')).toBeTruthy();
  expect(queryByTestId('walk-map-view')).toBeNull();
});

test('renders nothing (not a crash) when the module is unavailable and no fallback given', async () => {
  loadMapsMock.mockReturnValue(null);
  const { toJSON } = await render(wrap(<WalkMap track={track} events={[]} mode="live" />));
  expect(toJSON()).toBeNull();
});

test('renders the fallback when the track is empty', async () => {
  const { queryByTestId } = await render(wrap(<WalkMap track={[]} events={[]} mode="live" />));
  expect(queryByTestId('walk-map-view')).toBeNull();
});

test('live mode: map with route polyline, start marker, user location, no finish flag', async () => {
  const { getByTestId, queryByTestId } = await render(
    wrap(<WalkMap track={track} events={[]} mode="live" />),
  );
  const map = getByTestId('walk-map-view');
  expect(map.props.showsUserLocation).toBe(true);
  expect(map.props.initialRegion.latitude).toBeCloseTo(29.761, 5);
  const line = getByTestId('walk-map-route');
  expect(line.props.coordinates).toHaveLength(3);
  expect(line.props.coordinates[0]).toEqual({ latitude: 29.76, longitude: -95.36 });
  expect(getByTestId('walk-map-start')).toBeTruthy();
  expect(queryByTestId('walk-map-finish')).toBeNull();
});

test('completed mode: start and finish flags, no user location', async () => {
  const { getByTestId } = await render(wrap(<WalkMap track={track} events={[]} mode="completed" />));
  expect(getByTestId('walk-map-view').props.showsUserLocation).toBe(false);
  expect(getByTestId('walk-map-start').props.coordinate).toEqual({
    latitude: 29.76,
    longitude: -95.36,
  });
  expect(getByTestId('walk-map-finish').props.coordinate).toEqual({
    latitude: 29.762,
    longitude: -95.362,
  });
});

test('event pins render at the track point nearest in time, with the marker art', async () => {
  const { getByTestId } = await render(
    wrap(
      <WalkMap
        track={track}
        events={[
          { type: 'pee', atMs: 1_000 },
          { type: 'poop', atMs: 19_000 },
        ]}
        mode="completed"
      />,
    ),
  );
  const pee = getByTestId('walk-map-pin-pee-0');
  expect(pee.props.coordinate).toEqual({ latitude: 29.76, longitude: -95.36 });
  expect(pee.props.image).toBeDefined();
  const poop = getByTestId('walk-map-pin-poop-1');
  expect(poop.props.coordinate).toEqual({ latitude: 29.762, longitude: -95.362 });
});

test('appearance maps to the Apple Maps userInterfaceStyle', async () => {
  const dark = await render(wrap(<WalkMap track={track} events={[]} mode="live" appearance="dark" />));
  expect(dark.getByTestId('walk-map-view').props.userInterfaceStyle).toBe('dark');
  const warm = await render(wrap(<WalkMap track={track} events={[]} mode="live" appearance="warm" />));
  expect(warm.getByTestId('walk-map-view').props.userInterfaceStyle).toBe('light');
});
