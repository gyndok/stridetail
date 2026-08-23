import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Refetch a query whenever this screen regains navigation focus.
 * Expo Router keeps tab screens mounted, so `refetchOnMount` never fires on
 * tab switches; without this, lists (e.g. Team) go stale after server-side
 * changes like an invite being accepted.
 * The first focus (mount) is skipped — useQuery already fetches then.
 */
export function useRefetchOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}
