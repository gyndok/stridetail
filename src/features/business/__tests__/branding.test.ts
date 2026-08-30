import {
  BRAND_COLORS,
  DEFAULT_BRAND_COLOR,
  brandColorLabel,
  updateBrandColor,
} from '../branding';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['update', 'eq']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: null, error: null };
});

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const chan = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(1) + 0.7152 * chan(3) + 0.0722 * chan(5);
}

/** Contrast ratio of white text on the given background. */
function whiteContrast(hex: string): number {
  return (1.0 + 0.05) / (luminance(hex) + 0.05);
}

describe('BRAND_COLORS palette', () => {
  test('every swatch is a 6-digit hex with a label, no duplicates', () => {
    const values = BRAND_COLORS.map((c) => c.hex);
    expect(new Set(values).size).toBe(values.length);
    for (const c of BRAND_COLORS) {
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  test('the Stridetail default leads the palette', () => {
    expect(DEFAULT_BRAND_COLOR).toBe('#E8642C');
    expect(BRAND_COLORS[0]!.hex).toBe(DEFAULT_BRAND_COLOR);
  });

  test('white header/button text stays readable on every swatch (>= 3:1)', () => {
    for (const c of BRAND_COLORS) {
      expect(whiteContrast(c.hex)).toBeGreaterThanOrEqual(3);
    }
  });

  test('brandColorLabel maps values and returns null for strangers', () => {
    expect(brandColorLabel('#3A7D5C')).toBe('Forest');
    expect(brandColorLabel('#123456')).toBeNull();
    expect(brandColorLabel(null)).toBeNull();
  });
});

describe('updateBrandColor', () => {
  test('updates exactly brand_color, scoped to the business', async () => {
    await updateBrandColor('biz-1', '#3A7D5C');
    expect(mockLog[0]!.table).toBe('businesses');
    expect(mockLog[0]!.steps).toEqual([
      ['update', [{ brand_color: '#3A7D5C' }]],
      ['eq', ['id', 'biz-1']],
    ]);
  });

  test('throws on error', async () => {
    mockResult = { data: null, error: new Error('denied') };
    await expect(updateBrandColor('biz-1', '#3A7D5C')).rejects.toThrow('denied');
  });
});
