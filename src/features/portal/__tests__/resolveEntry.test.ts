import type { Membership } from '@/src/features/business/api';

import type { ClientLink } from '../api';
import { resolveEntry } from '../resolveEntry';

const m = (id: string, role: 'owner' | 'walker'): Membership => ({
  id: `m-${id}`,
  business_id: id,
  role,
  status: 'active',
  business: { id, name: id, brand_color: '#E8642C', time_zone: 'UTC', logo_path: null, access_grace_hours: 12 },
});

const link = (id: string): ClientLink => ({ id: `cu-${id}`, business_id: id, client_id: `c-${id}` });

test('memberships win: staff routing unchanged', () => {
  expect(resolveEntry([m('a', 'owner')], [], null, false)).toEqual({
    href: '/(owner)/today',
    businessId: 'a',
  });
  expect(resolveEntry([m('a', 'walker')], [], 'a', false)).toEqual({
    href: '/(walker)/today',
    businessId: 'a',
  });
});

test('dual-role user (staff + client) lands on staff', () => {
  expect(resolveEntry([m('a', 'owner')], [link('b')], null, true).href).toBe('/(owner)/today');
});

test('client links only → portal', () => {
  expect(resolveEntry([], [link('b')], null, false)).toEqual({
    href: '/(portal)/home',
    businessId: null,
  });
});

test('no memberships, no links, came through portal-login → portal (no-account state)', () => {
  expect(resolveEntry([], [], null, true).href).toBe('/(portal)/home');
});

test('no memberships, no links, staff door → business onboarding', () => {
  expect(resolveEntry([], [], null, false).href).toBe('/onboarding/create-business');
});
