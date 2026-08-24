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

export type FieldMode = 'warm' | 'dark';

/**
 * Field-mode theme scope (Plan 4 Task 5, spec §9): wraps ONE screen (the
 * active visit). `mode='dark'` flips the surface/ink/line tokens to the dark
 * sub-palette; primary stays the business accent inherited from the parent
 * ThemeProvider.
 *
 * Round 0 (Alexandra): the default is **warm** — the parent theme passes
 * through untouched — which overrides spec §9's dark-by-default field mode.
 * Dark remains available through the `walkTheme` setting.
 */
export function FieldTheme({ mode = 'warm', children }: PropsWithChildren<{ mode?: FieldMode }>) {
  const parent = useTheme();
  const value = useMemo<Theme>(
    () => (mode === 'dark' ? { ...parent, colors: { ...parent.colors, ...tokens.dark } } : parent),
    [parent, mode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
