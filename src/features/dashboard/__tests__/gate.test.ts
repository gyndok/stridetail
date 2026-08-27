import { DASHBOARD_MIN_WIDTH, decideTodayVariant } from '../gate';

describe('decideTodayVariant', () => {
  test('web at exactly 1024 gets the dashboard', () => {
    expect(DASHBOARD_MIN_WIDTH).toBe(1024);
    expect(decideTodayVariant('web', 1024)).toBe('dashboard');
    expect(decideTodayVariant('web', 1600)).toBe('dashboard');
  });

  test('web below 1024 keeps mobile Today (rail band 900-1023 included)', () => {
    expect(decideTodayVariant('web', 1023)).toBe('mobile');
    expect(decideTodayVariant('web', 900)).toBe('mobile');
    expect(decideTodayVariant('web', 375)).toBe('mobile');
  });

  test('native never gets the dashboard, at any width', () => {
    expect(decideTodayVariant('ios', 1440)).toBe('mobile');
    expect(decideTodayVariant('android', 2048)).toBe('mobile');
  });
});
