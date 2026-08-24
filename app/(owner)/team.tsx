import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Share, Text } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import {
  createInvite,
  queueInviteSms,
  type MemberRole,
  type MembershipStatus,
} from '@/src/features/business/api';
import { buildInviteLink } from '@/src/features/business/inviteLink';
import { APP_NAME } from '@/src/lib/brand';
import { supabase } from '@/src/lib/supabase';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';

type Row = {
  id: string;
  role: MemberRole;
  status: MembershipStatus;
  invited_email: string | null;
  invited_phone: string | null;
  profile: { display_name: string | null } | null;
};

export default function Team() {
  const t = useTheme();
  const { businessId } = useActiveBusiness();
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the last created invite had a phone number: offers queueing the
  // invite link as an SMS through the Plan-4 notifications queue.
  const [pendingSms, setPendingSms] = useState<{ phone: string; token: string } | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsQueued, setSmsQueued] = useState(false);
  const members = useQuery({
    queryKey: ['members', businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, role, status, invited_email, invited_phone, profile:profiles(display_name)')
        .eq('business_id', businessId!)
        .order('created_at');
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  useRefetchOnFocus(members.refetch);

  async function invite() {
    const trimmed = contact.trim();
    if (!businessId || !trimmed) return;
    setBusy(true);
    setError(null);
    setPendingSms(null);
    setSmsQueued(false);
    try {
      const isEmail = trimmed.includes('@');
      const token = await createInvite(businessId, 'walker', isEmail ? { email: trimmed } : { phone: trimmed });
      if (!isEmail) setPendingSms({ phone: trimmed, token });
      await Share.share({ message: `Join my team on ${APP_NAME}: ${buildInviteLink(token)}` });
      setContact('');
      await members.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function queueSms() {
    if (!businessId || !pendingSms) return;
    setSmsBusy(true);
    setError(null);
    try {
      await queueInviteSms(businessId, pendingSms.phone, pendingSms.token);
      setSmsQueued(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSmsBusy(false);
    }
  }

  return (
    <Screen title="Team">
      {(members.data ?? []).map((m) => (
        <Card key={m.id}>
          <Text style={[t.type.body, { color: t.colors.ink }]}>
            {m.profile?.display_name ?? m.invited_email ?? m.invited_phone ?? 'Pending'}
          </Text>
          <Text style={{ color: t.colors.inkMuted }}>
            {m.role} · {m.status}
          </Text>
        </Card>
      ))}
      <TextField
        label="Invite a walker (phone or email)"
        value={contact}
        onChangeText={setContact}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button title="Create invite link" onPress={() => void invite()} loading={busy} />
      {pendingSms ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={{ color: t.colors.ink }}>Invite created for {pendingSms.phone}</Text>
          {smsQueued ? (
            <Text style={{ color: t.colors.inkMuted }}>
              SMS queued — it sends automatically once SMS delivery is set up.
            </Text>
          ) : (
            <Button title="Queue SMS invite" variant="ghost" onPress={() => void queueSms()} loading={smsBusy} />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
