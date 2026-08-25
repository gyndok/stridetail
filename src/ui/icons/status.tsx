import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { stroke, useIconColors, type IconProps } from './shared';

/** Padlock with a filled keyhole dot. */
export function LockIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5.75} y={10.5} width={12.5} height={9.25} rx={2.2} {...stroke(color)} />
      <Path d="M8.5 10.5V7.75a3.5 3.5 0 0 1 7 0v2.75" {...stroke(color)} />
      <Circle cx={12} cy={14.9} r={1.2} fill={color} />
    </Svg>
  );
}

/**
 * Circle check: ring in `color`, check in `accent`, optional `background`
 * fill inside the ring (e.g. greenSoft behind a green-on-green check).
 */
export function CheckCircleIcon(props: IconProps & { background?: string }) {
  const { size, color, accent } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={12}
        cy={12}
        r={8.75}
        {...stroke(color)}
        fill={props.background ?? 'none'}
      />
      <Path d="M8.1 12.4l2.65 2.65 5.15-5.6" {...stroke(accent)} />
    </Svg>
  );
}

/** Arrow leaving an open box. */
export function ShareIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11 5.6H6.6a2.1 2.1 0 0 0-2.1 2.1v9.7a2.1 2.1 0 0 0 2.1 2.1h9.7a2.1 2.1 0 0 0 2.1-2.1V13"
        {...stroke(color)}
      />
      <Path d="M15.4 3.6h5v5" {...stroke(color)} />
      <Path d="M20.1 3.9 12.9 11.1" {...stroke(color)} />
    </Svg>
  );
}
