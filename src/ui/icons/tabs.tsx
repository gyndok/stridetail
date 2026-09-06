import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { stroke, useIconColors, type IconProps } from './shared';

/** Sun rising over a horizon — "what's happening now". */
export function TodayIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7.25 17.5a4.75 4.75 0 0 1 9.5 0M3.5 17.5h17M12 7.25v2.5M5.55 11.05l1.77 1.77M18.45 11.05l-1.77 1.77"
        {...stroke(color)}
      />
    </Svg>
  );
}

/** Calendar with hangers and one event dot. */
export function ScheduleIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3.75} y={5.25} width={16.5} height={15} rx={2.5} {...stroke(color)} />
      <Path d="M3.75 9.75h16.5M8.25 3v3M15.75 3v3" {...stroke(color)} />
      <Circle cx={8.75} cy={13.9} r={1.15} fill={color} />
    </Svg>
  );
}

/** Single person. */
export function ClientsIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={7.75} r={3.5} {...stroke(color)} />
      <Path d="M5.25 19.75a6.75 6.75 0 0 1 13.5 0" {...stroke(color)} />
    </Svg>
  );
}

/** Two persons, the second peeking from behind. */
export function TeamIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8.25} r={3.1} {...stroke(color)} />
      <Path d="M3 19.5a6 6 0 0 1 12 0" {...stroke(color)} />
      <Path d="M15.9 5.2a3.1 3.1 0 0 1 0 6.05" {...stroke(color)} />
      <Path d="M17.5 13.7c2.1.9 3.5 2.9 3.5 5.5" {...stroke(color)} />
    </Svg>
  );
}

/** Eight-tooth gear (generated polygon; round joins soften the teeth). */
export function SettingsIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9.92 5.21L10.45 2.73L13.55 2.73L14.08 5.21L15.33 5.73L17.46 4.35L19.65 6.54L18.27 8.67L18.79 9.92L21.27 10.45L21.27 13.55L18.79 14.08L18.27 15.33L19.65 17.46L17.46 19.65L15.33 18.27L14.08 18.79L13.55 21.27L10.45 21.27L9.92 18.79L8.67 18.27L6.54 19.65L4.35 17.46L5.73 15.33L5.21 14.08L2.73 13.55L2.73 10.45L5.21 9.92L5.73 8.67L4.35 6.54L6.54 4.35L8.67 5.73Z"
        {...stroke(color)}
      />
      <Circle cx={12} cy={12} r={3.1} {...stroke(color)} />
    </Svg>
  );
}

/** Open book: two facing pages over a center spine — the user's manual. */
export function ManualIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 6.6C10.55 5.25 8.6 4.6 6.2 4.6c-1 0-1.9.12-2.7.36v13.6c.8-.24 1.7-.36 2.7-.36 2.4 0 4.35.65 5.8 1.95 1.45-1.3 3.4-1.95 5.8-1.95 1 0 1.9.12 2.7.36V4.96c-.8-.24-1.7-.36-2.7-.36-2.4 0-4.35.65-5.8 2Z"
        {...stroke(color)}
      />
      <Path d="M12 6.6v13.55" {...stroke(color)} />
    </Svg>
  );
}

/** Document with a folded corner and a dollar line. */
export function BillingIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14 3.25H7.75A1.75 1.75 0 0 0 6 5v14a1.75 1.75 0 0 0 1.75 1.75h8.5A1.75 1.75 0 0 0 18 19V7.25L14 3.25Z"
        {...stroke(color)}
      />
      <Path d="M14 3.25v4h4" {...stroke(color)} />
      <Path
        d="M13.85 11.2c-.35-.7-1.05-1.1-1.85-1.1-1.05 0-1.85.62-1.85 1.5 0 2 3.7 1 3.7 3 0 .88-.8 1.5-1.85 1.5-.8 0-1.5-.4-1.85-1.1M12 8.75v1.2M12 16.75v1.2"
        {...stroke(color)}
      />
    </Svg>
  );
}

/** Dog face: rounded head, floppy ears, dot eyes and nose. */
export function DogIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 4.75c3.7 0 6.75 3 6.75 6.75v2.6c0 3.15-2.55 5.65-5.65 5.65h-2.2c-3.1 0-5.65-2.5-5.65-5.65v-2.6C5.25 7.75 8.3 4.75 12 4.75Z"
        {...stroke(color)}
      />
      <Path d="M7 6.4C4.9 7.3 3.6 9.5 4 12c.3 1.7 1.3 2.9 2.7 3.3" {...stroke(color)} />
      <Path d="M17 6.4c2.1.9 3.4 3.1 3 5.6-.3 1.7-1.3 2.9-2.7 3.3" {...stroke(color)} />
      <Circle cx={9.6} cy={11.4} r={1} fill={color} />
      <Circle cx={14.4} cy={11.4} r={1} fill={color} />
      <Circle cx={12} cy={14.7} r={1.2} fill={color} />
    </Svg>
  );
}

/** Cat face: round head, pointed ears, whiskers, triangle nose. */
export function CatIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={13} r={6.4} {...stroke(color)} />
      <Path d="M7.4 8.9 6.3 4.5l4.3 2.4Z" {...stroke(color)} />
      <Path d="M16.6 8.9l1.1-4.4-4.3 2.4Z" {...stroke(color)} />
      <Path d="M2.7 12.6h2.4M3 15.1l2.3-.7M21.3 12.6h-2.4M21 15.1l-2.3-.7" {...stroke(color)} />
      <Circle cx={9.5} cy={12.2} r={0.95} fill={color} />
      <Circle cx={14.5} cy={12.2} r={0.95} fill={color} />
      <Path d="M11.1 14.6h1.8L12 15.9Z" fill={color} />
    </Svg>
  );
}

/** Paw: main pad plus four toes. */
export function PawIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 11.4c2.95 0 5.1 2.05 5.1 4.4 0 1.85-1.45 3.3-3.3 3.3-.65 0-1.25-.17-1.8-.5-.55.33-1.15.5-1.8.5-1.85 0-3.3-1.45-3.3-3.3 0-2.35 2.15-4.4 5.1-4.4Z"
        {...stroke(color)}
      />
      <Circle cx={5.3} cy={9.7} r={1.75} {...stroke(color)} />
      <Circle cx={9.6} cy={6.6} r={1.85} {...stroke(color)} />
      <Circle cx={14.4} cy={6.6} r={1.85} {...stroke(color)} />
      <Circle cx={18.7} cy={9.7} r={1.75} {...stroke(color)} />
    </Svg>
  );
}

/** Ledger: three ruled lines, amounts right-aligned as short ticks. */
export function TransactionsIcon(props: IconProps) {
  const { size, color } = useIconColors(props);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3.75} y={4.25} width={16.5} height={15.5} rx={2.5} {...stroke(color)} />
      <Path d="M7 9h6.5M17 9h.01M7 12.5h5M16 12.5h1.01M7 16h6M16.5 16h.51" {...stroke(color)} />
    </Svg>
  );
}
