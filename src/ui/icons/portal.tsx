import Svg, { Circle, Path } from 'react-native-svg';

import { stroke, useIconColors, type IconProps } from './shared';

/**
 * Portal tab icons (Plan 8 Task 4), same system as tabs.tsx: 24×24 viewBox,
 * strokeWidth 1.75, round caps/joins, no baked backgrounds, tint via `color`.
 */

/** House with a door — the portal home. */
export function HomeIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.5 10.4 12 4.25l7.5 6.15V19a1.75 1.75 0 0 1-1.75 1.75h-11.5A1.75 1.75 0 0 1 4.5 19Z"
        {...stroke(color)}
      />
      <Path d="M9.9 20.75v-5.4a2.1 2.1 0 0 1 4.2 0v5.4" {...stroke(color)} />
    </Svg>
  );
}

/** Report card: document with a folded corner, text lines and a paw dot. */
export function ReportsIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14 3.25H7.75A1.75 1.75 0 0 0 6 5v14a1.75 1.75 0 0 0 1.75 1.75h8.5A1.75 1.75 0 0 0 18 19V7.25L14 3.25Z"
        {...stroke(color)}
      />
      <Path d="M14 3.25v4h4" {...stroke(color)} />
      <Path d="M9 12h6M9 15.25h6" {...stroke(color)} />
      <Circle cx={9.4} cy={9.1} r={0.95} fill={color} />
    </Svg>
  );
}

/** Calendar with a plus — ask for a visit. */
export function RequestIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.75 7.75a2.5 2.5 0 0 1 2.5-2.5h11.5a2.5 2.5 0 0 1 2.5 2.5v9.5a2.5 2.5 0 0 1-2.5 2.5H6.25a2.5 2.5 0 0 1-2.5-2.5Z"
        {...stroke(color)}
      />
      <Path d="M3.75 9.75h16.5M8.25 3v3M15.75 3v3" {...stroke(color)} />
      <Path d="M12 12.4v4M10 14.4h4" {...stroke(color)} />
    </Svg>
  );
}
