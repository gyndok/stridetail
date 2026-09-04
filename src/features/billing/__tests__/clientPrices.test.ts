import { effectiveBaseCents } from '../clientPrices';

jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

test('effectiveBaseCents: override wins, absence falls back to the service base', () => {
  expect(effectiveBaseCents(2000, 2500)).toBe(2000); // grandfathered lower
  expect(effectiveBaseCents(3000, 2500)).toBe(3000); // premium client
  expect(effectiveBaseCents(0, 2500)).toBe(0); // free (family) is a valid override
  expect(effectiveBaseCents(null, 2500)).toBe(2500);
  expect(effectiveBaseCents(undefined, 2500)).toBe(2500);
});
