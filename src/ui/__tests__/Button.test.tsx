import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme';
import { Button } from '../Button';

test('button calls onPress and is disabled while loading', async () => {
  const onPress = jest.fn();
  const { getByRole, getByText, rerender } = await render(
    <ThemeProvider><Button title="Start walk" onPress={onPress} /></ThemeProvider>,
  );
  await fireEvent.press(getByText('Start walk'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await rerender(<ThemeProvider><Button title="Start walk" onPress={onPress} loading /></ThemeProvider>);
  // label is replaced by a spinner while loading, so locate the control by role
  await fireEvent.press(getByRole('button'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
