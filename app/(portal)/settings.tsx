import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { signOut } from '@/src/features/auth/session';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import { supabase } from '@/src/lib/supabase';
import { Button } from '@/src/ui/Button';
import { useTheme } from '@/src/ui/theme';

/**
 * Portal settings (sponsor request after Checkpoint 8's Marcus run): the one
 * place a client signs out and learns how getting back in works. Deliberately
 * tiny — clients are passwordless BY DESIGN (sponsor-confirmed 2026-08-27):
 * the emailed code proves inbox ownership each visit, and there is no
 * password for anyone to forget or for the business to reset.
 */
export default function PortalSettings() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
  }, []);

  const card = {
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: t.radius.card,
    padding: t.space.lg,
    gap: t.space.xs,
  } as const;

  return (
    <PortalScreen title="Settings">
      <View style={{ gap: t.space.md }}>
        <View style={card}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>SIGNED IN AS</Text>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
            {email ?? 'your email'}
          </Text>
        </View>
        <View style={card}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>HOW SIGNING IN WORKS</Text>
          <Text style={[t.type.body, { color: t.colors.ink }]}>
            No password to remember. Any time you come back to stridetail.app, we email a
            one-time code to {email ?? 'your address'} and that code signs you in. Staying on
            this device keeps you signed in between visits.
          </Text>
        </View>
        <Button
          title="Sign out"
          variant="ghost"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await signOut();
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </PortalScreen>
  );
}
