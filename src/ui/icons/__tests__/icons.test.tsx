import { render } from '@testing-library/react-native';
import { type ComponentType, type ReactElement } from 'react';

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
import { ThemeProvider } from '@/src/ui/theme';
import { tokens } from '@/src/ui/tokens';

const ICONS: [string, ComponentType<IconProps>][] = [
  ['TodayIcon', TodayIcon],
  ['ScheduleIcon', ScheduleIcon],
  ['ClientsIcon', ClientsIcon],
  ['TeamIcon', TeamIcon],
  ['SettingsIcon', SettingsIcon],
  ['BillingIcon', BillingIcon],
  ['DogIcon', DogIcon],
  ['CatIcon', CatIcon],
  ['PawIcon', PawIcon],
  ['PeeIcon', PeeIcon],
  ['PoopIcon', PoopIcon],
  ['PhotoIcon', PhotoIcon],
  ['NoteIcon', NoteIcon],
  ['AteIcon', AteIcon],
  ['DrankIcon', DrankIcon],
  ['MedsIcon', MedsIcon],
  ['LockIcon', LockIcon],
  ['CheckCircleIcon', CheckCircleIcon],
  ['ShareIcon', ShareIcon],
];

const wrap = (el: ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

/** Collect every prop bag in the rendered JSON tree (svg stub passes props through). */
type JsonNode = { props?: Record<string, unknown>; children?: unknown[] } | string | null;
function collectProps(node: JsonNode | JsonNode[], out: Record<string, unknown>[] = []) {
  if (node == null || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectProps(n, out));
    return out;
  }
  if (node.props) out.push(node.props);
  if (node.children) collectProps(node.children as JsonNode[], out);
  return out;
}

describe('icon system v1', () => {
  it.each(ICONS)('%s renders without throwing', async (_name, Icon) => {
    const r = await wrap(<Icon />);
    expect(r.toJSON()).toBeTruthy();
  });

  it.each(ICONS)('%s respects an explicit color prop', async (_name, Icon) => {
    const r = await wrap(<Icon color="#123456" size={16} />);
    const paints = collectProps(r.toJSON() as JsonNode).flatMap((p) => [p.stroke, p.fill]);
    expect(paints).toContain('#123456');
    // theme ink never leaks through when a color is passed
    expect(paints).not.toContain(tokens.colors.ink);
  });

  it('defaults color to theme ink and accent to theme primary', async () => {
    const r = await wrap(<PhotoIcon />);
    const paints = collectProps(r.toJSON() as JsonNode).flatMap((p) => [p.stroke, p.fill]);
    expect(paints).toContain(tokens.colors.ink); // camera body
    expect(paints).toContain(tokens.colors.primary); // paw shutter dot
  });

  it('CheckCircleIcon fills the circle with the background prop', async () => {
    const r = await wrap(<CheckCircleIcon background={tokens.colors.greenSoft} />);
    const fills = collectProps(r.toJSON() as JsonNode).map((p) => p.fill);
    expect(fills).toContain(tokens.colors.greenSoft);
  });

  it('sizes the svg root from the size prop', async () => {
    const r = await wrap(<PawIcon size={32} />);
    const root = collectProps(r.toJSON() as JsonNode)[0]!;
    expect(root.width).toBe(32);
    expect(root.height).toBe(32);
  });
});
