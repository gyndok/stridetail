import { type ColorValue } from 'react-native';

import { useTheme } from '../theme';

/**
 * Icon system v1 (spec: docs' "Expo Pet-Care Icon System", adapted).
 * Every icon draws in a 24×24 viewBox, strokeWidth 1.75, round caps/joins,
 * no baked backgrounds. Colors default from the theme (color = ink,
 * accent = primary) but an explicitly passed `color` ALWAYS wins — the tab
 * bar hands its active/inactive tint (a ColorValue) through this prop.
 */
export type IconProps = { size?: number; color?: ColorValue; accent?: ColorValue };

export const STROKE_WIDTH = 1.75;

export function useIconColors(props: IconProps): {
  size: number;
  color: ColorValue;
  accent: ColorValue;
} {
  const t = useTheme();
  return {
    size: props.size ?? 24,
    color: props.color ?? t.colors.ink,
    accent: props.accent ?? t.colors.primary,
  };
}

/** Standard stroke prop bundle for a path/shape drawn in line style. */
export function stroke(color: ColorValue) {
  return {
    stroke: color,
    strokeWidth: STROKE_WIDTH,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  } as const;
}
