import { createContext, PropsWithChildren, useContext, useMemo } from 'react';
import { tokens } from './tokens';

export type Theme = {
  // widened to string so a business accent can override the literal token value
  colors: { [K in keyof typeof tokens.colors]: string };
  radius: typeof tokens.radius;
  space: typeof tokens.space;
  type: typeof tokens.type;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ accent, children }: PropsWithChildren<{ accent?: string }>) {
  const value = useMemo<Theme>(
    () => ({
      ...tokens,
      colors: { ...tokens.colors, primary: accent ?? tokens.colors.primary },
    }),
    [accent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}

/**
 * Field-mode theme scope (Plan 4 Task 5, spec §9): wraps ONE screen (the
 * active visit) in the dark sub-palette while everything else keeps the light
 * theme. Only the surface/ink/line tokens flip; primary stays the business
 * accent inherited from the parent ThemeProvider.
 */
export function FieldTheme({ children }: PropsWithChildren) {
  const parent = useTheme();
  const value = useMemo<Theme>(
    () => ({ ...parent, colors: { ...parent.colors, ...tokens.dark } }),
    [parent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
