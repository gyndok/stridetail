import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/src/features/auth/session';

import { listMyMemberships } from './api';

export function useMemberships() {
  const { status } = useSession();
  return useQuery({ queryKey: ['memberships'], queryFn: listMyMemberships, enabled: status === 'signed-in' });
}
