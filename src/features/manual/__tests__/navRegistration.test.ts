import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Source-order guards for the manual's navigation wiring. The Tabs navigators
// are too heavy to render under jest, but the rail maps route order straight
// from the Tabs.Screen registration order, so the source order IS the
// user-visible order — pin it.

const ROOT = process.cwd();
const ownerLayout = readFileSync(join(ROOT, 'app/(owner)/_layout.tsx'), 'utf8');
const walkerLayout = readFileSync(join(ROOT, 'app/(walker)/_layout.tsx'), 'utf8');

describe('manual navigation registration', () => {
  test('owner layout registers manual between billing and settings', () => {
    const billing = ownerLayout.indexOf('name="billing"');
    const manual = ownerLayout.indexOf('name="manual"');
    const settings = ownerLayout.indexOf('name="settings"');
    expect(billing).toBeGreaterThanOrEqual(0);
    expect(manual).toBeGreaterThan(billing);
    expect(settings).toBeGreaterThan(manual);
  });

  test('owner manual tab is web-only (hidden on native via href)', () => {
    const manualBlock = ownerLayout.slice(
      ownerLayout.indexOf('name="manual"'),
      ownerLayout.indexOf('name="settings"'),
    );
    expect(manualBlock).toContain('Platform.OS');
    expect(manualBlock).toContain('null');
  });

  test('walker layout carries manual as a hidden route', () => {
    const manual = walkerLayout.indexOf('name="manual"');
    expect(manual).toBeGreaterThanOrEqual(0);
    const block = walkerLayout.slice(manual, manual + 200);
    expect(block).toContain('href: null');
  });

  test('both route files exist and render the shared screen', () => {
    for (const p of ['app/(owner)/manual.tsx', 'app/(walker)/manual.tsx']) {
      expect(existsSync(join(ROOT, p))).toBe(true);
      expect(readFileSync(join(ROOT, p), 'utf8')).toContain('ManualScreen');
    }
  });
});
