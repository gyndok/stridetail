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
    // field mode (active visit, dark)
    fieldBg: '#0B0F14',
    fieldSheet: '#151C27',
    fieldInk: '#F3F4F6',
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
