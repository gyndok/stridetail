import { type ComponentType } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/src/ui/Card';
import {
  AteIcon,
  BillingIcon,
  CatIcon,
  CheckCircleIcon,
  ClientsIcon,
  DogIcon,
  DrankIcon,
  LockIcon,
  MedsIcon,
  NoteIcon,
  PawIcon,
  PeeIcon,
  PhotoIcon,
  PoopIcon,
  ScheduleIcon,
  SettingsIcon,
  ShareIcon,
  TeamIcon,
  TodayIcon,
  type IconProps,
} from '@/src/ui/icons';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

/**
 * Dev-only icon gallery (gps-spike precedent: a plain route outside the tab
 * groups, reachable at /dev/icons, never linked from the app). Every icon at
 * 16 / 24 / 32 in ink, primary, and green, on both surfaces.
 */

const ICONS: [string, ComponentType<IconProps>][] = [
  ['Today', TodayIcon],
  ['Schedule', ScheduleIcon],
  ['Clients', ClientsIcon],
  ['Team', TeamIcon],
  ['Settings', SettingsIcon],
  ['Billing', BillingIcon],
  ['Dog', DogIcon],
  ['Cat', CatIcon],
  ['Paw', PawIcon],
  ['Pee', PeeIcon],
  ['Poop', PoopIcon],
  ['Photo', PhotoIcon],
  ['Note', NoteIcon],
  ['Ate', AteIcon],
  ['Drank', DrankIcon],
  ['Meds', MedsIcon],
  ['Lock', LockIcon],
  ['CheckCircle', CheckCircleIcon],
  ['Share', ShareIcon],
];

const SIZES = [16, 24, 32] as const;

function Gallery({ surface }: { surface: 'surface' | 'surfaceRaised' }) {
  const t = useTheme();
  const colors: [string, string][] = [
    ['ink', t.colors.ink],
    ['primary', t.colors.primary],
    ['green', t.colors.green],
  ];
  return (
    <Card style={{ backgroundColor: t.colors[surface], gap: t.space.md }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{surface}</Text>
      {colors.map(([name, color]) => (
        <View key={name} style={{ gap: t.space.sm }}>
          <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>{name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md }}>
            {ICONS.map(([label, Icon]) => (
              <View key={label} style={{ alignItems: 'center', gap: 2, width: 76 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                  {SIZES.map((s) => (
                    <Icon key={s} size={s} color={color} />
                  ))}
                </View>
                <Text style={{ color: t.colors.inkMuted, fontSize: 10 }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </Card>
  );
}

export default function IconGallery() {
  const t = useTheme();
  return (
    <Screen title="Icon system v1">
      <Gallery surface="surface" />
      <Gallery surface="surfaceRaised" />
      <Card style={{ gap: t.space.sm }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Variants</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
          <CheckCircleIcon size={32} color={t.colors.green} accent={t.colors.green} background={t.colors.greenSoft} />
          <Text style={{ color: t.colors.ink }}>CheckCircle on greenSoft (completed)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
          <MedsIcon size={32} />
          <PhotoIcon size={32} />
          <Text style={{ color: t.colors.ink }}>Default theme colors (ink + primary accent)</Text>
        </View>
      </Card>
    </Screen>
  );
}
