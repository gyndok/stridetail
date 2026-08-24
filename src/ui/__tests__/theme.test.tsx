import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { FieldTheme, ThemeProvider, useTheme } from '../theme';

function Probe() {
  const t = useTheme();
  return <Text testID="primary">{t.colors.primary}</Text>;
}

function SurfaceProbe() {
  const t = useTheme();
  return <Text testID="surface">{t.colors.surface}</Text>;
}

test('default primary is brand orange', async () => {
  const { getByTestId } = await render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(getByTestId('primary').props.children).toBe('#E8642C');
});

test('business accent overrides primary', async () => {
  const { getByTestId } = await render(<ThemeProvider accent="#3366FF"><Probe /></ThemeProvider>);
  expect(getByTestId('primary').props.children).toBe('#3366FF');
});

// Round 0: the field screen is warm by default (spec §9 said dark).
test('FieldTheme defaults to warm — the parent surface passes through', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <FieldTheme>
        <SurfaceProbe />
      </FieldTheme>
    </ThemeProvider>,
  );
  expect(getByTestId('surface').props.children).toBe('#FFF4E6');
});

test('FieldTheme mode="dark" flips the surface but keeps the accent', async () => {
  const { getByTestId } = await render(
    <ThemeProvider accent="#3366FF">
      <FieldTheme mode="dark">
        <SurfaceProbe />
        <Probe />
      </FieldTheme>
    </ThemeProvider>,
  );
  expect(getByTestId('surface').props.children).toBe('#1A1410');
  expect(getByTestId('primary').props.children).toBe('#3366FF');
});
