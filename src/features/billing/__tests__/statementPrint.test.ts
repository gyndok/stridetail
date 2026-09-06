import { buildStatementHtml, escapeHtml, statementTitle } from '../statementPrint';

import type { Statement } from '../statements';

const meta = {
  businessName: 'Paw & Whisker Pet Services',
  personName: 'Karla Klein',
  mode: 'clients' as const,
  rangeLabel: 'Sep 1, 2026 – Sep 30, 2026',
  generatedYmd: '2026-09-05',
};

const statement: Statement = {
  summary: {
    forwardCents: 0,
    chargedCents: 23500,
    creditedCents: 18500,
    balanceCents: 5000,
    tipsCents: 5000,
    heldCents: 2500,
  },
  rows: [
    {
      date: '2026-09-04',
      kind: 'payment',
      description: 'Payment · Venmo · INV-0070',
      note: 'includes $25.00 tip — not counted toward the balance',
      chargeCents: 0,
      creditCents: 2500,
      balanceCents: 5000,
      info: false,
    },
  ],
};

test('statementTitle names the PDF like a document', () => {
  expect(statementTitle(meta)).toBe(
    'Karla Klein — Paw & Whisker Pet Services statement — 2026-09-05',
  );
});

test('escapeHtml neutralizes markup in user-entered text', () => {
  expect(escapeHtml('<img src=x onerror=1> & "quotes"')).toBe(
    '&lt;img src=x onerror=1&gt; &amp; &quot;quotes&quot;',
  );
});

test('the printed document carries title, summary, rows, and the tip rule', () => {
  const html = buildStatementHtml(statement, meta);
  expect(html).toContain('<title>Karla Klein — Paw &amp; Whisker Pet Services statement — 2026-09-05</title>');
  expect(html).toContain('Karla Klein owes');
  expect(html).toContain('$50.00'); // balance and tips
  expect(html).toContain('never counted toward the balance');
  expect(html).toContain('Held for future care: $25.00');
  expect(html).toContain('Payment · Venmo · INV-0070');
  expect(html).toContain('@page'); // print margins baked into the document
});

test('walker mode swaps the column and summary language', () => {
  const html = buildStatementHtml(
    { ...statement, summary: { ...statement.summary, heldCents: undefined } },
    { ...meta, mode: 'walkers', personName: 'Kelly Whipple' },
  );
  expect(html).toContain('Kelly Whipple is owed');
  expect(html).toContain('>Earned</');
  expect(html).toContain('>Paid out</');
  expect(html).not.toContain('Held for future care');
});

test('a hostile client name cannot inject markup into the document', () => {
  const html = buildStatementHtml(statement, {
    ...meta,
    personName: '<script>alert(1)</script>',
  });
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;');
});
