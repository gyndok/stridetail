import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/src/features/auth/session';

import { listMyClientLinks } from './api';

export function useClientLinks() {
  const { status } = useSession();
  return useQuery({ queryKey: ['client-links'], queryFn: listMyClientLinks, enabled: status === 'signed-in' });
}
