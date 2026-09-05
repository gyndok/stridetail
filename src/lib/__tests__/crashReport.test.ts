import { buildEnvelope, envelopeUrlFromDsn, installCrashReporter } from '../crashReport';

jest.mock('@/src/lib/offline/db', () => ({
  getDb: () => ({
    runSync: jest.fn(),
    runAsync: jest.fn(async () => ({ changes: 0 })),
    getAllAsync: jest.fn(async () => []),
  }),
}));

describe('envelopeUrlFromDsn', () => {
  test('turns a DSN into the envelope ingest URL with query auth', () => {
    expect(envelopeUrlFromDsn('https://abc123@o456.ingest.us.sentry.io/789')).toBe(
      'https://o456.ingest.us.sentry.io/api/789/envelope/?sentry_key=abc123&sentry_version=7',
    );
  });
  test('rejects junk and empty DSNs (reporter stays dormant)', () => {
    expect(envelopeUrlFromDsn('')).toBeNull();
    expect(envelopeUrlFromDsn('not-a-dsn')).toBeNull();
    expect(envelopeUrlFromDsn('http://insecure@host/1')).toBeNull();
  });
});

describe('buildEnvelope', () => {
  const ctx = {
    release: 'stridetail@0.2.2',
    dist: '8',
    updateId: 'update-uuid',
    isEmbeddedLaunch: false,
  };

  test('three-line envelope carrying the error, stack, and update identity', () => {
    const envelope = buildEnvelope(
      { name: 'TypeError', message: 'x is not a function', stack: 'at boot' },
      true,
      ctx,
    );
    const [header, itemHeader, event] = envelope.split('\n').map((l) => JSON.parse(l));
    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(itemHeader.type).toBe('event');
    expect(event.level).toBe('fatal');
    expect(event.release).toBe('stridetail@0.2.2');
    expect(event.dist).toBe('8');
    expect(event.tags.update_id).toBe('update-uuid');
    expect(event.exception.values[0]).toEqual({ type: 'TypeError', value: 'x is not a function' });
    expect(event.extra.stack).toBe('at boot');
  });

  test('non-fatal errors and embedded launches are labeled as such', () => {
    const envelope = buildEnvelope({ message: 'm' }, false, {
      ...ctx,
      updateId: null,
      isEmbeddedLaunch: true,
    });
    const event = JSON.parse(envelope.split('\n')[2]!);
    expect(event.level).toBe('error');
    expect(event.tags.update_id).toBe('embedded');
    expect(event.tags.embedded_launch).toBe('true');
  });
});

describe('installCrashReporter', () => {
  test('wraps the existing global handler and always calls it through', () => {
    const original = jest.fn();
    let current: (e: unknown, fatal?: boolean) => void = original;
    (globalThis as Record<string, unknown>).ErrorUtils = {
      getGlobalHandler: () => current,
      setGlobalHandler: (h: typeof current) => {
        current = h;
      },
    };
    installCrashReporter();
    expect(current).not.toBe(original); // hooked
    const boom = new Error('boot failure');
    current(boom, true);
    expect(original).toHaveBeenCalledWith(boom, true); // the real handler still runs
    delete (globalThis as Record<string, unknown>).ErrorUtils;
  });
});
