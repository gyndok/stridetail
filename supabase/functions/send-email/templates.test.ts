// deno test supabase/functions/send-email/templates.test.ts
//
// Pins the exact email subjects/bodies (aligned with the SMS wording in
// ../send-sms/templates.ts — the client reads the same message on either
// channel) and the copied retry backoff schedule.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import {
  backoffMinutes,
  centsToDollars,
  escapeHtml,
  invoiceNumberLabel,
  MAX_ATTEMPTS,
  renderEmail,
} from './templates.ts';

const ctx = {
  businessName: 'Paw & Whisker',
  petNames: 'Biscuit',
  serviceName: 'Walk',
  reportUrl: 'https://stridetail.app/report/abc123',
  inviteLink: 'stridetail://invite/tok456',
  invoiceNumberLabel: 'INV-0007',
  invoiceTotalCents: 4500,
  invoiceUrl: 'https://stridetail.app/invoice/tok789',
};

Deno.test('visit_started subject and text', () => {
  const m = renderEmail('visit_started', ctx)!;
  assertEquals(m.subject, "Paw & Whisker: Biscuit's Walk visit has started");
  assertEquals(m.text, "Paw & Whisker: Walker has started Biscuit's Walk visit.");
  assertStringIncludes(m.html, 'Paw &amp; Whisker: Walker has started');
});

Deno.test('visit_finished text matches the SMS wording and carries the report link', () => {
  const m = renderEmail('visit_finished', ctx)!;
  assertEquals(m.subject, "Paw & Whisker: Biscuit's Walk visit report");
  assertEquals(
    m.text,
    "Paw & Whisker: Walker has finished Biscuit's Walk visit. Report: https://stridetail.app/report/abc123",
  );
  assertStringIncludes(m.html, '<a href="https://stridetail.app/report/abc123">');
});

Deno.test('visit_finished without a report url degrades honestly', () => {
  const m = renderEmail('visit_finished', { ...ctx, reportUrl: undefined })!;
  assertStringIncludes(m.html, 'will follow separately');
});

Deno.test('invoice_ready subject, text (aligned with invoiceSmsBody), and link', () => {
  const m = renderEmail('invoice_ready', ctx)!;
  assertEquals(m.subject, 'Paw & Whisker — invoice INV-0007');
  assertEquals(
    m.text,
    'Paw & Whisker: Your invoice INV-0007 is ready. Total due: $45.00. ' +
      'View and pay: https://stridetail.app/invoice/tok789',
  );
  assertStringIncludes(m.html, '<a href="https://stridetail.app/invoice/tok789">');
  assertStringIncludes(m.html, 'Total due: $45.00.');
});

Deno.test('invoice_ready without a number/total degrades honestly', () => {
  const m = renderEmail('invoice_ready', {
    ...ctx,
    invoiceNumberLabel: undefined,
    invoiceTotalCents: undefined,
  })!;
  assertEquals(m.subject, 'Paw & Whisker — your invoice is ready');
  assertEquals(
    m.text,
    'Paw & Whisker: Your invoice is ready. View and pay: https://stridetail.app/invoice/tok789',
  );
});

Deno.test('invoice_ready without a url defers the link', () => {
  const m = renderEmail('invoice_ready', { ...ctx, invoiceUrl: undefined })!;
  assertStringIncludes(m.html, 'will follow separately');
});

Deno.test('centsToDollars renders sign outside the $, two decimals always', () => {
  assertEquals(centsToDollars(4500), '$45.00');
  assertEquals(centsToDollars(-500), '-$5.00');
  assertEquals(centsToDollars(0), '$0.00');
  assertEquals(centsToDollars(5), '$0.05');
});

Deno.test('invoiceNumberLabel pads to four digits and outgrows the pad', () => {
  assertEquals(invoiceNumberLabel(7), 'INV-0007');
  assertEquals(invoiceNumberLabel(12345), 'INV-12345');
});

Deno.test('invite subject and link', () => {
  const m = renderEmail('invite', ctx)!;
  assertEquals(m.subject, 'Paw & Whisker invited you to join their team on Stridetail');
  assertEquals(
    m.text,
    'Paw & Whisker invited you to join their team on Stridetail: stridetail://invite/tok456',
  );
});

Deno.test('multi-pet names read naturally', () => {
  const m = renderEmail('visit_started', { ...ctx, petNames: 'Biscuit & Max' })!;
  assertEquals(m.text, "Paw & Whisker: Walker has started Biscuit & Max's Walk visit.");
});

Deno.test('unknown template renders null (permanent failure upstream)', () => {
  assertEquals(renderEmail('password_reset', ctx), null);
});

Deno.test('html escaping covers the interpolation characters', () => {
  assertEquals(escapeHtml('<b>&"x"</b>'), '&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
});

Deno.test('backoff schedule is 1/5/15/60/60/60 with clamping', () => {
  assertEquals(backoffMinutes(1), 1);
  assertEquals(backoffMinutes(2), 5);
  assertEquals(backoffMinutes(3), 15);
  assertEquals(backoffMinutes(4), 60);
  assertEquals(backoffMinutes(5), 60);
  assertEquals(backoffMinutes(0), 1); // clamp low
  assertEquals(backoffMinutes(99), 60); // clamp high
  assertEquals(MAX_ATTEMPTS, 6);
});
