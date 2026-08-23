export const INVITE_SCHEME_PREFIX = 'stridetail://invite/';

export const buildInviteLink = (token: string) => `${INVITE_SCHEME_PREFIX}${token}`;

export function parseInviteToken(url: string): string | null {
  if (!url.startsWith(INVITE_SCHEME_PREFIX)) return null;
  const token = url.slice(INVITE_SCHEME_PREFIX.length);
  return token.length ? token : null;
}
