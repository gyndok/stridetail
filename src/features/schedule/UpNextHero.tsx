import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import {
  acceptVisit,
  declineVisit,
  serviceRequiresGps,
  visitDayLabel,
  visitTimeRange,
  visitsOnLocalDay,
  type Visit,
} from '@/src/features/schedule/api';
import { listPetNames } from '@/src/features/schedule/report';
import { appendVisitStart } from '@/src/features/visit/api';
import type { VisitDetail } from '@/src/features/visit/detail';
import { nextVisitAction, type NextVisitAction } from '@/src/features/visit/nextAction';
import { startVisitTracking } from '@/src/lib/gps/controller';
import { kickSync } from '@/src/lib/offline/sync';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

/**
 * "Up next" hero (Today/navigation redesign, part B): the ONE visit the user
 * should think about next, with its single next action as the big button —
 * resolved through nextVisitAction so this card can never disagree with the
 * unified visit screen. Shared by the owner and walker Today screens; the only
 * role differences ride in as props (isOwnerRole, and the group-local
 * detailHref to the unified visit screen).
 *
 * Start does exactly what the old walker detail's Start did: outbox first
 * (appendVisitStart), optimistic local status, GPS tracking only when the
 * service requires it (requires_gps via the price-free services_public view),
 * kickSync, then the cross-group active href (part A pattern — the active
 * screen exists only in the walker group).
 */

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Part A pattern: absolute group-qualified href, valid from either group. */
const activeHref = (visitId: string): Href => `/(walker)/visit/${visitId}/active` as Href;

function actionFor(visit: Visit, userId: string | null, isOwnerRole: boolean): NextVisitAction {
  return nextVisitAction(visit, {
    isAssignee: !!visit.walker_id && !!userId && visit.walker_id === userId,
    isOwnerRole,
    isToday: visitsOnLocalDay([visit], new Date()).length > 0,
  });
}

/**
 * Mutation/navigation runners shared by the hero and the inline card action.
 * Invalidates both list keys so either Today variant refreshes.
 */
function useVisitActionRunner(businessId: string | null) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['myVisits'] });
    if (businessId) void queryClient.invalidateQueries({ queryKey: ['visits', businessId] });
  };

  const acceptMut = useMutation({
    mutationFn: (v: Visit) => acceptVisit(v.id),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorText(e)),
  });
  const declineMut = useMutation({
    mutationFn: (input: { id: string; reason: string }) => declineVisit(input.id, input.reason),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorText(e)),
  });

  const resume = (v: Visit) => router.push(activeHref(v.id));

  const start = async (v: Visit, requiresGps: boolean) => {
    setStarting(true);
    setError(null);
    try {
      // Outbox first (spec §8): the start lands locally and syncs in order.
      await appendVisitStart(v.id);
      // Optimistic local status; the server catches up via the sync worker.
      queryClient.setQueryData<VisitDetail>(['visitDetail', v.id], (old) =>
        old ? { ...old, visit: { ...old.visit, status: 'in_progress' } } : old,
      );
      invalidate();
      if (requiresGps) {
        try {
          await startVisitTracking(v.id);
        } catch (e) {
          // Permission denied: the visit is still started — only the route is lost.
          Alert.alert(
            'GPS not recording',
            `${errorText(e)}\n\nThe visit has still started; the route will not be recorded.`,
          );
        }
      }
      kickSync();
      router.push(activeHref(v.id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  };

  return { acceptMut, declineMut, resume, start, starting, error };
}

/** requires_gps prefetch for a visit whose next action is Start. When the
 * query cannot answer (offline, no cache) Start assumes GPS — recording an
 * unneeded route beats silently losing a required one. */
function useRequiresGps(visit: Visit, enabled: boolean) {
  const q = useQuery({
    queryKey: ['serviceGps', visit.service_id],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => serviceRequiresGps(visit.service_id),
  });
  return q.data ?? true;
}

type HeroProps = {
  visit: Visit;
  userId: string | null;
  isOwnerRole: boolean;
  businessId: string | null;
  /** Unified visit screen href in the CURRENT group ("Instructions & codes"). */
  detailHref: Href;
};

export function UpNextHero({ visit, userId, isOwnerRole, businessId, detailHref }: HeroProps) {
  const t = useTheme();
  const router = useRouter();
  const runner = useVisitActionRunner(businessId);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const action = actionFor(visit, userId, isOwnerRole);
  const requiresGps = useRequiresGps(visit, action.kind === 'start');
  const petNames = useQuery({
    queryKey: ['visitPetNames', visit.id],
    enabled: visit.pet_ids.length > 0,
    queryFn: () => listPetNames(visit.pet_ids),
  });

  const petsLine = (petNames.data ?? []).join(', ');
  const busy = runner.starting || runner.acceptMut.isPending || runner.declineMut.isPending;

  return (
    <View style={{ gap: t.space.sm }}>
      <Text style={[t.type.title, { color: t.colors.ink }]}>Up next</Text>
      <Card style={{ gap: t.space.sm }}>
        <Text style={{ color: t.colors.ink, fontSize: 22, fontWeight: '800' }}>
          {visit.client?.name ?? 'Client'}
          {petsLine ? ` · ${petsLine}` : ''}
        </Text>
        <Text style={{ color: t.colors.ink, fontWeight: '600' }}>
          {visitDayLabel(visit)} · {visitTimeRange(visit)}
        </Text>
        <Text style={{ color: t.colors.inkMuted }}>
          {visit.service?.name ?? 'Service'}
          {visit.service ? ` · ${visit.service.duration_min} min` : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Instructions and codes"
          onPress={() => router.push(detailHref)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: t.colors.primary, fontWeight: '700' }}>
            Instructions &amp; codes →
          </Text>
        </Pressable>

        {runner.error ? <Text style={{ color: t.colors.danger }}>{runner.error}</Text> : null}

        {action.kind === 'start' ? (
          <Button
            title="Start visit"
            onPress={() => void runner.start(visit, requiresGps)}
            loading={runner.starting}
            disabled={busy}
          />
        ) : null}
        {action.kind === 'resume' ? (
          <Button title="Resume visit" onPress={() => runner.resume(visit)} />
        ) : null}
        {action.kind === 'accept' ? (
          declining ? (
            <View style={{ gap: t.space.sm }}>
              <TextField
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="Why can't you take this visit?"
                autoFocus
              />
              <Button
                title="Confirm decline"
                onPress={() => runner.declineMut.mutate({ id: visit.id, reason: reason.trim() })}
                disabled={!reason.trim() || busy}
                loading={runner.declineMut.isPending}
              />
              <Button
                title="Keep offer"
                variant="ghost"
                onPress={() => {
                  setDeclining(false);
                  setReason('');
                }}
              />
            </View>
          ) : (
            <View style={{ gap: t.space.sm }}>
              <Button
                title="Accept"
                onPress={() => runner.acceptMut.mutate(visit)}
                disabled={busy}
                loading={runner.acceptMut.isPending}
              />
              <Button
                title="Decline"
                variant="ghost"
                onPress={() => {
                  setDeclining(true);
                  setReason('');
                }}
                disabled={busy}
              />
            </View>
          )
        ) : null}
        {action.kind === 'none' ? (
          <Text style={{ color: t.colors.inkMuted }}>{action.reason}</Text>
        ) : null}
      </Card>
    </View>
  );
}

type InlineProps = {
  visit: Visit;
  userId: string | null;
  isOwnerRole: boolean;
  businessId: string | null;
};

/**
 * The resolved next-action button for a rest-of-day VisitCard (its `action`
 * prop). Renders only the single actionable kinds — accept/start/resume;
 * offer/report/none stay on the visit screen, not the list.
 */
export function InlineNextAction({ visit, userId, isOwnerRole, businessId }: InlineProps) {
  const t = useTheme();
  const runner = useVisitActionRunner(businessId);
  const action = actionFor(visit, userId, isOwnerRole);
  const requiresGps = useRequiresGps(visit, action.kind === 'start');

  if (action.kind !== 'accept' && action.kind !== 'start' && action.kind !== 'resume') return null;
  return (
    <View style={{ gap: t.space.xs }}>
      {runner.error ? <Text style={{ color: t.colors.danger }}>{runner.error}</Text> : null}
      {action.kind === 'accept' ? (
        <Button
          title="Accept"
          variant="secondary"
          onPress={() => runner.acceptMut.mutate(visit)}
          loading={runner.acceptMut.isPending}
        />
      ) : null}
      {action.kind === 'start' ? (
        <Button
          title="Start visit"
          variant="secondary"
          onPress={() => void runner.start(visit, requiresGps)}
          loading={runner.starting}
        />
      ) : null}
      {action.kind === 'resume' ? (
        <Button title="Resume visit" variant="secondary" onPress={() => runner.resume(visit)} />
      ) : null}
    </View>
  );
}
