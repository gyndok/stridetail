import { fireEvent, render } from '@testing-library/react-native';

import { ManualScreen } from '@/src/features/manual/ManualScreen';
import { MANUAL_SECTIONS, MANUAL_UPDATED } from '@/src/features/manual/content';
import { ThemeProvider } from '@/src/ui/theme';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const wrap = () =>
  render(
    <ThemeProvider>
      <ManualScreen />
    </ThemeProvider>,
  );

/** First paragraph-like text of a section — hidden until the section expands. */
function firstBodyText(sectionId: string): string {
  const s = MANUAL_SECTIONS.find((x) => x.id === sectionId)!;
  const b = s.blocks.find((x) => x.kind === 'p' || x.kind === 'tip');
  if (b && (b.kind === 'p' || b.kind === 'tip')) return b.text;
  const steps = s.blocks.find((x) => x.kind === 'steps');
  return steps && steps.kind === 'steps' ? steps.items[0]! : '';
}

describe('ManualScreen', () => {
  test('renders the version line and a TOC entry per section', async () => {
    const r = await wrap();
    expect(r.getByText(new RegExp(MANUAL_UPDATED))).toBeTruthy();
    for (const s of MANUAL_SECTIONS) {
      // Every title appears at least once (TOC row; twice when expanded).
      expect(r.getAllByText(s.title).length).toBeGreaterThanOrEqual(1);
    }
  });

  test('sections start collapsed; tapping a TOC row expands the section', async () => {
    const r = await wrap();
    const target = MANUAL_SECTIONS[0]!;
    const body = firstBodyText(target.id);
    expect(r.queryByText(body)).toBeNull();
    await fireEvent.press(r.getByTestId(`manual-toc-${target.id}`));
    expect(r.getByText(body)).toBeTruthy();
  });

  test('tapping a section header toggles it open and closed', async () => {
    const r = await wrap();
    const target = MANUAL_SECTIONS[1]!;
    const body = firstBodyText(target.id);
    const header = r.getByTestId(`manual-header-${target.id}`);
    await fireEvent.press(header);
    expect(r.getByText(body)).toBeTruthy();
    await fireEvent.press(header);
    expect(r.queryByText(body)).toBeNull();
  });

  test('shows an audience badge for each section', async () => {
    const r = await wrap();
    // At least one of each label used by the content should be on screen (TOC).
    const audiences = new Set(MANUAL_SECTIONS.map((s) => s.audience));
    const labels: Record<string, string> = {
      owner: 'Owner',
      walker: 'Walker',
      client: 'Clients',
      all: 'Everyone',
    };
    for (const a of audiences) {
      expect(r.getAllByText(labels[a]!).length).toBeGreaterThanOrEqual(1);
    }
  });
});
