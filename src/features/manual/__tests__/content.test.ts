import {
  MANUAL_SECTIONS,
  MANUAL_UPDATED,
  MANUAL_VERSION,
  type ManualBlock,
} from '../content';

// The manual is a living document (CLAUDE.md Workflow rule): these tests pin
// its structural integrity so future edits keep it renderable and complete.

const VALID_AUDIENCES = ['owner', 'walker', 'client', 'all'];

function blockIsEmpty(b: ManualBlock): boolean {
  if (b.kind === 'steps') return b.items.length === 0 || b.items.some((s) => s.trim() === '');
  return b.text.trim() === '';
}

describe('manual content integrity', () => {
  test('section ids are unique kebab-case slugs', () => {
    const ids = MANUAL_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test('every section has a title and at least one non-empty block', () => {
    for (const s of MANUAL_SECTIONS) {
      expect(s.title.trim()).not.toBe('');
      expect(s.blocks.length).toBeGreaterThan(0);
      for (const b of s.blocks) expect(blockIsEmpty(b)).toBe(false);
    }
  });

  test('every audience value is valid', () => {
    for (const s of MANUAL_SECTIONS) expect(VALID_AUDIENCES).toContain(s.audience);
  });

  test('covers the core areas end to end', () => {
    const ids = MANUAL_SECTIONS.map((s) => s.id);
    for (const required of [
      'getting-started',
      'today-and-dashboard',
      'scheduling',
      'clients-and-pets',
      'walking',
      'reports',
      'billing',
      'booking-requests',
      'client-portal',
      'troubleshooting',
    ]) {
      expect(ids).toContain(required);
    }
  });

  test('version and last-updated constants are set', () => {
    expect(MANUAL_VERSION.trim()).not.toBe('');
    expect(MANUAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
