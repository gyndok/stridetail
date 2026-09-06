import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { signOut } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { BrandColorPicker } from '@/src/features/business/BrandColorPicker';
import { DEFAULT_BRAND_COLOR, updateBrandColor } from '@/src/features/business/branding';
import { useMemberships } from '@/src/features/business/useMemberships';
import {
  parseRequiredVaccines,
  SPECIES_VACCINE_OPTIONS,
  updateRequiredVaccines,
  type RequiredVaccines,
} from '@/src/features/pets/vaccines';
import { docTypeLabel } from '@/src/features/pets/documents';
import { Chip } from '@/src/features/schedule/Chip';
import {
  applyUpdate,
  checkAndFetchUpdate,
  currentUpdateInfo,
  updateLine,
  type CheckOutcome,
} from '@/src/features/settings/appUpdates';
import { useWalkTheme, type WalkTheme } from '@/src/features/settings/walkTheme';
import Constants from 'expo-constants';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';
import { errorText } from '@/src/lib/errorText';

const WALK_THEMES: { key: WalkTheme; label: string }[] = [
  { key: 'warm', label: 'Warm' },
  { key: 'dark', label: 'Dark' },
];

/**
 * Shared by the owner and walker settings tabs. `extra` renders role-specific
 * rows (e.g. the owner's Services link) above the sign-out button; the walker
 * route passes nothing.
 */
export function SettingsScreen({ extra }: { extra?: ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { businessId, setBusinessId } = useActiveBusiness();
  const { data } = useMemberships();
  const membership = data?.find((m) => m.business_id === businessId);
  const current = membership?.business;
  const role = membership?.role;
  const { walkTheme, setWalkTheme } = useWalkTheme();
  return (
    <Screen title="Settings">
      <Card>
        <Text style={[t.type.title, { color: t.colors.ink }]}>{current?.name ?? '—'}</Text>
        <Text style={{ color: t.colors.inkMuted }}>{current?.time_zone}</Text>
      </Card>
      {data && data.length > 1
        ? data.map((m) => (
            <Button
              key={m.id}
              title={`Switch to ${m.business.name}`}
              variant="secondary"
              onPress={() => void setBusinessId(m.business_id)}
            />
          ))
        : null}
      {/* Walk screen appearance (Round 0): shared by both roles — walkers are
          the ones who use it, but an owner walks their own visits too. */}
      <Card style={{ gap: t.space.sm }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Walk screen</Text>
        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          {WALK_THEMES.map((m) => (
            <View key={m.key} style={{ flex: 1 }}>
              <Button
                title={m.label}
                variant={walkTheme === m.key ? 'primary' : 'secondary'}
                onPress={() => void setWalkTheme(m.key)}
              />
            </View>
          ))}
        </View>
      </Card>
      {role === 'owner' && businessId ? (
        <BrandingCard
          businessId={businessId}
          savedColor={current?.brand_color ?? DEFAULT_BRAND_COLOR}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['memberships'] })}
        />
      ) : null}
      {role === 'owner' && businessId ? (
        <RequiredVaccinesCard
          businessId={businessId}
          saved={parseRequiredVaccines(current?.required_vaccines)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['memberships'] })}
        />
      ) : null}
      {/* Earnings (Plan 6): mounted in both groups (tab-shell unification,
          2026-09-06) — owners walk their own visits too and see their own
          finalized statements (walker-side RLS), or an empty list, without
          being teleported into the walker shell. */}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push((role === 'owner' ? '/(owner)/earnings' : '/(walker)/earnings') as Href)
        }
      >
        <Card>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Earnings</Text>
          <Text style={{ color: t.colors.inkMuted }}>Your finalized payout statements</Text>
        </Card>
      </Pressable>
      {extra}
      {/* User's manual (living document, src/features/manual): both roles get
          the row; it routes through the group matching the role because the
          owner group's role guard bounces walkers (unlike Earnings, whose
          walker-group route is open to both). */}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push((role === 'owner' ? '/(owner)/manual' : '/(walker)/manual') as Href)
        }
      >
        <Card>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
            User&apos;s manual
          </Text>
          <Text style={{ color: t.colors.inkMuted }}>How everything works, in plain English</Text>
        </Card>
      </Pressable>
      <AppUpdateCard />
      <Button
        title="Sign out"
        variant="ghost"
        onPress={() =>
          void signOut().then(() => {
            void setBusinessId(null);
            qc.clear();
          })
        }
      />
    </Screen>
  );
}

/**
 * Owner-only client-facing brand color (2026-08-30, sponsor request).
 * Save-on-tap: choosing a swatch writes businesses.brand_color immediately
 * (owner-update RLS, the billing-settings write pattern) and refreshes the
 * memberships cache the embed reads from. The color dresses report pages,
 * invoices, the portal, and the branded emails — the app's own chrome stays
 * on Stridetail tokens.
 */
/**
 * Owner-only required vaccines (wish list #5, 2026-09-01). Save-on-tap like
 * the brand color: toggling a chip writes businesses.required_vaccines and
 * refreshes the memberships cache the booking screen reads from. The booking
 * screen shows a warning for missing/expired required vaccines — never a block.
 */
function RequiredVaccinesCard({
  businessId,
  saved,
  onSaved,
}: {
  businessId: string;
  saved: RequiredVaccines;
  onSaved: () => void;
}) {
  const t = useTheme();
  const [pending, setPending] = useState<RequiredVaccines | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = pending ?? saved;

  async function toggle(species: string, type: string) {
    const cur = shown[species] ?? [];
    const next = {
      ...shown,
      [species]: cur.includes(type as (typeof cur)[number])
        ? cur.filter((x) => x !== type)
        : [...cur, type as (typeof cur)[number]],
    };
    setPending(next);
    setError(null);
    try {
      await updateRequiredVaccines(businessId, next);
      onSaved();
    } catch (e) {
      setPending(null);
      setError(errorText(e));
    }
  }

  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Required vaccines</Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
        Booking a visit warns you when a selected pet is missing one of these or its record has
        expired. It never blocks the booking.
      </Text>
      {SPECIES_VACCINE_OPTIONS.map((group) => (
        <View key={group.species} style={{ gap: t.space.xs }}>
          <Text style={{ color: t.colors.ink, fontWeight: '600' }}>{group.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {group.types.map((type) => (
              <Chip
                key={type}
                label={docTypeLabel(type)}
                selected={(shown[group.species] ?? []).includes(type)}
                onPress={() => void toggle(group.species, type)}
              />
            ))}
          </View>
        </View>
      ))}
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
    </Card>
  );
}

function BrandingCard({
  businessId,
  savedColor,
  onSaved,
}: {
  businessId: string;
  savedColor: string;
  onSaved: () => void;
}) {
  const t = useTheme();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = pending ?? savedColor;

  async function pick(color: string) {
    if (color === shown) return;
    setPending(color);
    setError(null);
    try {
      await updateBrandColor(businessId, color);
      onSaved();
    } catch (e) {
      setPending(null);
      setError(errorText(e));
    }
  }

  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Brand color</Text>
      <BrandColorPicker value={shown} onSelect={(c) => void pick(c)} />
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
    </Card>
  );
}

/**
 * App-version + self-serve OTA card (2026-09-04). One tap checks, downloads,
 * and offers an in-place restart — retires the "force-quit twice" ritual for
 * every tester. Shows which bundle is running for support conversations.
 */
function AppUpdateCard() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const info = currentUpdateInfo();
  const appVersion = Constants.expoConfig?.version ?? null;

  async function check() {
    setBusy(true);
    setOutcome(null);
    const result = await checkAndFetchUpdate();
    setOutcome(result);
    setBusy(false);
  }

  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>App version</Text>
      <Text style={{ color: t.colors.ink }}>
        {appVersion ? `Stridetail ${appVersion}` : 'Stridetail'}
      </Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>{updateLine(info, appVersion)}</Text>
      {info.kind !== 'unavailable' ? (
        outcome?.status === 'ready-to-restart' ? (
          <>
            <Button title="Restart to finish updating" onPress={() => void applyUpdate()} />
            <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
              The app closes and reopens itself — if your phone shows a &quot;crashed&quot;
              message afterwards, that&apos;s just how iOS logs the restart; nothing is wrong.
            </Text>
          </>
        ) : (
          <Button
            title="Check for updates"
            variant="secondary"
            onPress={() => void check()}
            loading={busy}
          />
        )
      ) : null}
      {outcome?.status === 'up-to-date' ? (
        <Text style={{ color: t.colors.green }}>You&apos;re up to date.</Text>
      ) : null}
      {outcome?.status === 'error' ? (
        <Text style={{ color: t.colors.danger }}>{outcome.message}</Text>
      ) : null}
    </Card>
  );
}
