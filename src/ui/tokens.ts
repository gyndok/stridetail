/**
 * Round 0 (Alexandra): direction B "but would like greens added". One green,
 * used as an accent for positive/nature notes — never as a surface. The warm
 * cream/orange base is unchanged.
 */
const green = '#3A7D5C';

export const tokens = {
  colors: {
    surface: '#FFF4E6',
    surfaceRaised: '#FFFFFF',
    primary: '#E8642C',
    onPrimary: '#FFFFFF',
    ink: '#2B1D12',
    inkMuted: '#8A5A2B',
    line: '#F0D9C2',
    danger: '#C53030',
    warning: '#B7791F',
    green,
    /** Soft green wash for badge fills; ink stays the text color on it. */
    greenSoft: '#E4F0E8',
    /**
     * Deliberate alias of `green` (was '#2F855A'): the palette carries exactly
     * one green, and `success` stays as the semantic name for the sync badge
     * and other "it worked" states.
     */
    success: green,
  },
  /**
   * Field-mode sub-palette (spec §9): dark surfaces for the active-visit
   * screen, applied by <FieldTheme> as an override of the matching color
   * tokens. primary/onPrimary are NOT overridden — the business accent stays.
   */
  dark: {
    surface: '#1A1410',
    surfaceRaised: '#26201A',
    ink: '#FFF4E6',
    inkMuted: '#C9A57E',
    line: '#3B2F22',
  },
  radius: { card: 24, pill: 999, input: 14 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  type: {
    hero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -1 },
    title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 },
    body: { fontSize: 15, fontWeight: '500' as const },
    label: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
  },
} as const;
