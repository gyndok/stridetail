import { PropsWithChildren } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '@/src/lib/brand';
import { useTheme } from '@/src/ui/theme';

import { usePortalScope } from './hooks';

/**
 * Portal page shell (Plan 8 Task 4): the TENANT's identity — a band in the
 * business's brand_color with the business name (public report-page pattern:
 * server data, not a literal color) — then a centered max-width column so the
 * web-first portal reads right on desktop AND mobile web, and the same
 * "Powered by Stridetail" footer as the public pages.
 */

/** Content column cap — wide enough for cards, narrow enough for desktop. */
export const PORTAL_MAX_WIDTH = 720;

/**
 * Friendly placeholder body for the Task 5–7 tabs (reports, invoices, pets,
 * requests). Those tasks replace the route files' bodies; the routes stay put.
 */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  const t = useTheme();
  return (
    <PortalScreen title={title}>
      <View
        style={{
          backgroundColor: t.colors.surfaceRaised,
          borderRadius: t.radius.card,
          padding: t.space.lg,
          gap: t.space.xs,
        }}
      >
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Coming soon</Text>
        <Text style={[t.type.body, { color: t.colors.inkMuted }]}>{note}</Text>
      </View>
    </PortalScreen>
  );
}

export function PortalScreen({ title, children }: PropsWithChildren<{ title?: string }>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { business } = usePortalScope();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xxl }}>
        <View
          style={{
            // The business's own brand color — server data, not a literal.
            backgroundColor: business?.brand_color ?? t.colors.primary,
            paddingTop: insets.top + t.space.lg,
            paddingBottom: t.space.lg,
            paddingHorizontal: t.space.lg,
          }}
        >
          <View style={{ width: '100%', maxWidth: PORTAL_MAX_WIDTH, alignSelf: 'center' }}>
            <Text style={[t.type.title, { color: t.colors.onPrimary }]}>
              {business?.name ?? ' '}
            </Text>
            {title ? (
              <Text style={[t.type.body, { color: t.colors.onPrimary, opacity: 0.9 }]}>{title}</Text>
            ) : null}
          </View>
        </View>
        <View
          style={{
            width: '100%',
            maxWidth: PORTAL_MAX_WIDTH,
            alignSelf: 'center',
            padding: t.space.lg,
            gap: t.space.md,
          }}
        >
          {children}
        </View>
        <Text style={{ color: t.colors.inkMuted, textAlign: 'center', fontSize: 12, marginTop: t.space.lg }}>
          Powered by {APP_NAME}
        </Text>
      </ScrollView>
    </View>
  );
}
