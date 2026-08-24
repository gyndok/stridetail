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
    success: '#2F855A',
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
