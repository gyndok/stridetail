import type { ClientLink } from '../api';
import { hydratePortalScope, resolvePortalLink, usePortalScopeStore } from '../scope';

const l1: ClientLink = { id: 'cu1', business_id: 'b1', client_id: 'c1' };
const l2: ClientLink = { id: 'cu2', business_id: 'b2', client_id: 'c2' };

describe('resolvePortalLink', () => {
  test('no links -> null', () => {
    expect(resolvePortalLink([], null)).toBeNull();
    expect(resolvePortalLink([], 'cu1')).toBeNull();
  });

  test('no selection -> first link', () => {
    expect(resolvePortalLink([l1, l2], null)).toBe(l1);
  });

  test('selection picks the matching link', () => {
    expect(resolvePortalLink([l1, l2], 'cu2')).toBe(l2);
  });

  test('stale selection (link removed) falls back to first', () => {
    expect(resolvePortalLink([l1, l2], 'cu9')).toBe(l1);
  });
});

describe('portal scope store', () => {
  function fakeKV(seed: Record<string, string> = {}) {
    const m = new Map(Object.entries(seed));
    return {
      kv: {
        getItem: async (k: string) => m.get(k) ?? null,
        setItem: async (k: string, v: string) => {
          m.set(k, v);
        },
        removeItem: async (k: string) => {
          m.delete(k);
        },
      },
      m,
    };
  }

  beforeEach(() => usePortalScopeStore.setState({ linkId: null, hydrated: false }));

  test('setLinkId persists and updates state', async () => {
    const { kv, m } = fakeKV();
    await usePortalScopeStore.getState().setLinkId('cu2', kv);
    expect(usePortalScopeStore.getState().linkId).toBe('cu2');
    expect(m.get('portalLinkId')).toBe('cu2');
  });

  test('setLinkId(null) clears the persisted value', async () => {
    const { kv, m } = fakeKV({ portalLinkId: 'cu2' });
    await usePortalScopeStore.getState().setLinkId(null, kv);
    expect(usePortalScopeStore.getState().linkId).toBeNull();
    expect(m.has('portalLinkId')).toBe(false);
  });

  test('hydratePortalScope restores the stored selection', async () => {
    const { kv } = fakeKV({ portalLinkId: 'cu2' });
    await hydratePortalScope(kv);
    expect(usePortalScopeStore.getState()).toMatchObject({ linkId: 'cu2', hydrated: true });
  });
});
