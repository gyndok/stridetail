import { Pressable, Text, View } from 'react-native';

import type { SlotClient } from '@/src/lib/schedule/travel';
import { useTheme } from '@/src/ui/theme';

import { walkerFlags, type PickerContext, type ScheduleMember, type WalkerFlags } from './api';

/** Human flag line for one picker row: "Available" or the problems, joined. */
export function flagLabel(flags: WalkerFlags): string {
  const problems: string[] = [];
  if (flags.onTimeOff) problems.push('Time off');
  if (flags.overlaps > 0)
    problems.push(`${flags.overlaps} overlapping`);
  if (!flags.available) problems.push('Outside availability');
  if (flags.tight)
    problems.push(`Tight transfer (~${flags.tight.driveMin} min drive, ${flags.tight.gapMin} min gap)`);
  return problems.length === 0 ? 'Available' : problems.join(' · ');
}

type Props = {
  members: ScheduleMember[];
  /** Null while the context (or the window) is still loading — rows render without flags. */
  ctx: PickerContext | null;
  window: { startUtc: Date; endUtc: Date } | null;
  tz: string | null;
  selectedId: string | null;
  onSelect: (userId: string | null) => void;
  /** Set when the window belongs to an existing visit (reassign) so it does not count itself. */
  excludeVisitId?: string;
  /** The visit's client (home coordinates) — enables the advisory tight-transfer
      flag; callers passing it must fetch `ctx` over the slot's whole local day. */
  slotClient?: SlotClient | null;
};

/**
 * Walker rows (every active member, owner included) with availability flags
 * from walkerFlags. Tapping a selected row deselects back to unassigned.
 */
export function WalkerPicker({ members, ctx, window, tz, selectedId, onSelect, excludeVisitId, slotClient }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.sm }}>
      {members.map((m) => {
        const selected = selectedId === m.user_id;
        const flags =
          ctx && window && tz
            ? walkerFlags(m.user_id, ctx, window, tz, { excludeVisitId, slotClient })
            : null;
        const good = flags
          ? flags.available && !flags.onTimeOff && flags.overlaps === 0 && !flags.tight
          : null;
        return (
          <Pressable
            key={m.user_id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(selected ? null : m.user_id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: t.colors.surfaceRaised,
              borderRadius: t.radius.input,
              borderWidth: 1,
              borderColor: selected ? t.colors.primary : t.colors.line,
              padding: t.space.md,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flexShrink: 1 }}>
              <Text style={[t.type.body, { color: t.colors.ink, fontWeight: selected ? '800' : '500' }]}>
                {m.display_name ?? 'Team member'}
                {m.role === 'owner' ? ' (owner)' : ''}
              </Text>
              {flags ? (
                <Text
                  style={{
                    // Round 0 green: "Available" is the positive note here.
                    color: good ? t.colors.green : t.colors.warning,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {flagLabel(flags)}
                </Text>
              ) : null}
            </View>
            {selected ? (
              <Text style={{ color: t.colors.primary, fontWeight: '800' }}>Selected</Text>
            ) : null}
          </Pressable>
        );
      })}
      {members.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No active team members.</Text>
      ) : null}
    </View>
  );
}
