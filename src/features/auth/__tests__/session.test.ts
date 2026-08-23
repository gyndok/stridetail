import { applyAuthEvent, useSessionStore } from '../session';

test('auth events move the store between states', () => {
  expect(useSessionStore.getState().status).toBe('loading');
  applyAuthEvent(null);
  expect(useSessionStore.getState()).toMatchObject({ status: 'signed-out', userId: null });
  applyAuthEvent({ user: { id: 'u1' } } as never);
  expect(useSessionStore.getState()).toMatchObject({ status: 'signed-in', userId: 'u1' });
});
