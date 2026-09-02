import Svg, { Circle, Path } from 'react-native-svg';

import { stroke, useIconColors, type IconProps } from './shared';

/** Droplet. */
export function PeeIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.9c3.1 3.65 5.35 6.8 5.35 9.85a5.35 5.35 0 1 1-10.7 0C6.65 10.7 8.9 7.55 12 3.9Z"
        {...stroke(color)}
      />
    </Svg>
  );
}

/**
 * Friendly soft-serve swirl, filled ink (the one filled silhouette in the
 * set — a stroked outline reads as ice cream, the solid fill does not).
 */
export function PoopIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.4c1 .6 1.65 1.7 1.65 2.9 0 .32-.05.63-.13.93 1.9.42 3.35 1.95 3.58 3.85 1.75.5 3.05 2.1 3.05 4 0 2.3-1.9 4.17-4.25 4.17H8.1c-2.35 0-4.25-1.87-4.25-4.17 0-1.9 1.3-3.5 3.05-4 .23-1.9 1.68-3.43 3.58-3.85-.08-.3-.13-.61-.13-.93 0-1.2.65-2.3 1.65-2.9Z"
        fill={color}
      />
    </Svg>
  );
}

/** Camera; the shutter dot is a tiny accent paw (visible from ~24px up). */
export function PhotoIcon(props: IconProps) {
  const { size, color, accent } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9.2 5.9l.75-1.35c.25-.45.72-.72 1.23-.72h1.64c.51 0 .98.27 1.23.72L14.8 5.9h2.7a2.25 2.25 0 0 1 2.25 2.25v8.1a2.25 2.25 0 0 1-2.25 2.25H6.5a2.25 2.25 0 0 1-2.25-2.25v-8.1A2.25 2.25 0 0 1 6.5 5.9h2.7Z"
        {...stroke(color)}
      />
      <Circle cx={12} cy={12.2} r={3.4} {...stroke(color)} />
      <Circle cx={12} cy={12.9} r={0.95} fill={accent} />
      <Circle cx={10.75} cy={11.85} r={0.5} fill={accent} />
      <Circle cx={12} cy={11.35} r={0.5} fill={accent} />
      <Circle cx={13.25} cy={11.85} r={0.5} fill={accent} />
    </Svg>
  );
}

/** Pencil. */
export function NoteIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17.6 3.05a2.4 2.4 0 0 1 3.35 3.35L8.75 18.6a1.8 1.8 0 0 1-.85.48l-3.55.87.87-3.55c.08-.32.24-.61.48-.85L17.6 3.05Z"
        {...stroke(color)}
      />
      <Path d="M15.05 5.6l3.35 3.35" {...stroke(color)} />
    </Svg>
  );
}

/** Food bowl with kibble. */
export function AteIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.1 12.9h15.8l-1.5 4.6a2.2 2.2 0 0 1-2.1 1.5H7.7a2.2 2.2 0 0 1-2.1-1.5L4.1 12.9Z"
        {...stroke(color)}
      />
      <Circle cx={9} cy={9.4} r={1.05} fill={color} />
      <Circle cx={12.9} cy={8.2} r={1.05} fill={color} />
      <Circle cx={15.7} cy={10.1} r={1.05} fill={color} />
    </Svg>
  );
}

/** Water bowl under a wave. */
export function DrankIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.1 13.4h15.8l-1.4 4.4a2.2 2.2 0 0 1-2.1 1.5H7.6a2.2 2.2 0 0 1-2.1-1.5L4.1 13.4Z"
        {...stroke(color)}
      />
      <Path d="M5.9 9.5q1.53-1.7 3.05 0t3.05 0t3.05 0t3.05 0" {...stroke(color)} />
    </Svg>
  );
}

/** Diagonal capsule; one half filled with the accent. */
export function MedsIcon(props: IconProps) {
  const { size, color, accent } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.19 14.19L16.66 11.72A3.1 3.1 0 0 0 12.28 7.34L9.81 9.81Z"
        fill={accent}
      />
      <Path
        d="M11.72 16.66L16.66 11.72A3.1 3.1 0 0 0 12.28 7.34L7.34 12.28A3.1 3.1 0 0 0 11.72 16.66Z"
        {...stroke(color)}
      />
      <Path d="M9.81 9.81L14.19 14.19" {...stroke(color)} />
    </Svg>
  );
}

/** Map pin (custom marks, wish list #1). */
export function MarkIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.6a6.15 6.15 0 0 1 6.15 6.15c0 3.4-2.7 6.9-6.15 10.65-3.45-3.75-6.15-7.25-6.15-10.65A6.15 6.15 0 0 1 12 3.6Z"
        {...stroke(color)}
      />
      <Circle cx={12} cy={9.75} r={2.1} {...stroke(color)} />
    </Svg>
  );
}
