import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { signOut } from '@/src/features/auth/session';
import { useClaimOnEmptyLinks } from '@/src/features/portal/claim';
import { useClientLinks } from '@/src/features/portal/useClientLinks';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

/**
 * Portal home (Plan 8 Task 2). Placeholder — Task 4 replaces the body with
 * the real dashboard; the route itself stays put. Doubles as the friendly
 * "no account found" landing for an OTP user their provider has not linked
 * yet (Task 3 builds the invite/claim path that creates the link).
 */
export default function PortalHome() {
  const t = useTheme();
  const qc = useQueryClient();
  const links = useClientLinks();
  const [busy, setBusy] = useState(false);
  // Task 3: an invited-but-unlinked OTP user gets claimed right here — the
  // ['client-links'] invalidation flips the view; everyone else keeps the
  // no-account message below.
  useClaimOnEmptyLinks();

  async function leave() {
    setBusy(true);
    await signOut();
    qc.clear();
  }

  if (!links.isSuccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  const linked = links.data.length > 0;
  return (
    <Screen>
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: t.space.md }}>
        {linked ? (
          <>
            <Text style={[t.type.hero, { color: t.colors.ink }]}>You&apos;re in</Text>
            <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
              Your portal is being set up. Your visits, report cards, and invoices will
              appear here soon.
            </Text>
          </>
        ) : (
          <>
            <Text style={[t.type.hero, { color: t.colors.ink }]}>No account found</Text>
            <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
              We couldn&apos;t find a pet care account for this email yet. Ask your pet care
              provider to send you an invite, or sign in with the email address where you
              receive their messages.
            </Text>
          </>
        )}
        <Button title="Sign out" variant="ghost" onPress={leave} loading={busy} />
      </View>
    </Screen>
  );
}
