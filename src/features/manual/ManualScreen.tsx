import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

import {
  MANUAL_SECTIONS,
  MANUAL_UPDATED,
  MANUAL_VERSION,
  type ManualAudience,
  type ManualBlock,
  type ManualSection,
} from './content';

/** Readable column on desktop web — the portal page precedent (PORTAL_MAX_WIDTH). */
export const MANUAL_MAX_WIDTH = 720;

const AUDIENCE_LABEL: Record<ManualAudience, string> = {
  owner: 'Owner',
  walker: 'Walker',
  client: 'Clients',
  all: 'Everyone',
};

function AudienceBadge({ audience }: { audience: ManualAudience }) {
  const t = useTheme();
  const tone: Record<ManualAudience, { color: ColorValue; background: ColorValue }> = {
    owner: { color: t.colors.primary, background: t.colors.surface },
    walker: { color: t.colors.green, background: t.colors.greenSoft },
    client: { color: t.colors.warning, background: t.colors.surface },
    all: { color: t.colors.inkMuted, background: t.colors.surface },
  };
  const { color, background } = tone[audience];
  return (
    <View
      style={{
        backgroundColor: background,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space.sm,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={[t.type.label, { color }]}>{AUDIENCE_LABEL[audience]}</Text>
    </View>
  );
}

function Block({ block }: { block: ManualBlock }) {
  const t = useTheme();
  if (block.kind === 'p') {
    return <Text style={[t.type.body, { color: t.colors.ink, lineHeight: 22 }]}>{block.text}</Text>;
  }
  if (block.kind === 'steps') {
    return (
      <View style={{ gap: t.space.sm }}>
        {block.items.map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: t.space.sm }}>
            <Text style={[t.type.body, { color: t.colors.primary, fontWeight: '800', minWidth: 18 }]}>
              {i + 1}.
            </Text>
            <Text style={[t.type.body, { color: t.colors.ink, lineHeight: 22, flex: 1 }]}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }
  // tip callout
  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: t.colors.green,
        backgroundColor: t.colors.greenSoft,
        borderRadius: t.radius.input,
        padding: t.space.md,
        gap: t.space.xs,
      }}
    >
      <Text style={[t.type.label, { color: t.colors.green }]}>Tip</Text>
      <Text style={[t.type.body, { color: t.colors.ink, lineHeight: 22 }]}>{block.text}</Text>
    </View>
  );
}

function SectionCard({
  section,
  expanded,
  onToggle,
  onLayoutY,
}: {
  section: ManualSection;
  expanded: boolean;
  onToggle: () => void;
  onLayoutY: (y: number) => void;
}) {
  const t = useTheme();
  return (
    <View onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}>
      <Card style={{ gap: expanded ? t.space.md : 0 }}>
        <Pressable
          testID={`manual-header-${section.id}`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}
        >
          <View style={{ flex: 1, gap: t.space.xs }}>
            <Text style={[t.type.title, { color: t.colors.ink }]}>{section.title}</Text>
            <AudienceBadge audience={section.audience} />
          </View>
          <Text style={{ color: t.colors.inkMuted, fontSize: 18, fontWeight: '800' }}>
            {expanded ? '−' : '+'}
          </Text>
        </Pressable>
        {expanded
          ? section.blocks.map((b, i) => <Block key={`${section.id}-${i}`} block={b} />)
          : null}
      </Card>
    </View>
  );
}

/**
 * The user's manual (living document — see content.ts). A table of contents
 * up top; tapping an entry expands that section and scrolls to it. Sections
 * collapse/expand from their headers. Centered 720 px column on wide screens,
 * mirroring the public portal pages.
 */
export function ManualScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const jumpTo = (id: string) => {
    setExpanded((e) => ({ ...e, [id]: true }));
    const y = sectionY.current[id];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo?.({ y: Math.max(0, y - t.space.md), animated: true });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: insets.top + t.space.lg,
          paddingBottom: insets.bottom + t.space.xl,
          paddingHorizontal: t.space.lg,
        }}
      >
        <View style={{ width: '100%', maxWidth: MANUAL_MAX_WIDTH, alignSelf: 'center', gap: t.space.md }}>
          <Text style={[t.type.hero, { color: t.colors.ink }]}>User&apos;s manual</Text>
          <Text style={{ color: t.colors.inkMuted }}>
            Version {MANUAL_VERSION} · Last updated {MANUAL_UPDATED}
          </Text>

          {/* Table of contents */}
          <Card style={{ gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>In this manual</Text>
            {MANUAL_SECTIONS.map((s) => (
              <Pressable
                key={s.id}
                testID={`manual-toc-${s.id}`}
                accessibilityRole="button"
                onPress={() => jumpTo(s.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space.sm,
                  paddingVertical: t.space.xs,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={[t.type.body, { color: t.colors.primary, fontWeight: '700', flex: 1 }]}>
                  {s.title}
                </Text>
                <AudienceBadge audience={s.audience} />
              </Pressable>
            ))}
          </Card>

          {MANUAL_SECTIONS.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              expanded={!!expanded[s.id]}
              onToggle={() => toggle(s.id)}
              onLayoutY={(y) => {
                sectionY.current[s.id] = y;
              }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
