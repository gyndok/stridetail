import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../theme';

function Probe() {
  const t = useTheme();
  return <Text testID="primary">{t.colors.primary}</Text>;
}

test('default primary is brand orange', async () => {
  const { getByTestId } = await render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(getByTestId('primary').props.children).toBe('#E8642C');
});

test('business accent overrides primary', async () => {
  const { getByTestId } = await render(<ThemeProvider accent="#3366FF"><Probe /></ThemeProvider>);
  expect(getByTestId('primary').props.children).toBe('#3366FF');
});
