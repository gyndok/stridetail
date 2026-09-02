import type { Membership } from '../api';
import { resolveHome } from '../resolveHome';

const m = (id: string, role: 'owner' | 'walker'): Membership => ({
  id: `m-${id}`,
  business_id: id,
  role,
  status: 'active',
  business: { id, name: id, brand_color: '#E8642C', time_zone: 'UTC', logo_path: null, access_grace_hours: 12, required_vaccines: {} },
});

test('no memberships → onboarding', () => {
  expect(resolveHome([], null).href).toBe('/onboarding/create-business');
});

test('active id wins when still a member', () => {
  expect(resolveHome([m('a', 'walker'), m('b', 'owner')], 'a')).toEqual({
    href: '/(walker)/today',
    businessId: 'a',
  });
});

test('stale active id falls back to first membership', () => {
  expect(resolveHome([m('b', 'owner')], 'zzz')).toEqual({ href: '/(owner)/today', businessId: 'b' });
});
