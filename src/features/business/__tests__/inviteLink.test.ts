import { buildInviteLink, parseInviteToken } from '../inviteLink';

test('invite link round-trips the token', () => {
  const link = buildInviteLink('abc123');
  expect(link).toBe('stridetail://invite/abc123');
  expect(parseInviteToken(link)).toBe('abc123');
});

test('parseInviteToken rejects foreign urls and empty tokens', () => {
  expect(parseInviteToken('https://example.com/invite/abc')).toBeNull();
  expect(parseInviteToken('stridetail://invite/')).toBeNull();
});
