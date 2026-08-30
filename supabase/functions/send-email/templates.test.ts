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
  formatInstant,
  formatWindow,
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
  assertStringIncludes(m.html, "Biscuit's Walk visit has started");
  assertStringIncludes(m.html, 'Paw &amp; Whisker</span>'); // branded header carries the business name
});

Deno.test('visit_finished text matches the SMS wording and carries the report link', () => {
  const m = renderEmail('visit_finished', ctx)!;
  assertEquals(m.subject, "Paw & Whisker: Biscuit's Walk visit report");
  assertEquals(
    m.text,
    "Paw & Whisker: Walker has finished Biscuit's Walk visit. Report: https://stridetail.app/report/abc123",
  );
  assertStringIncludes(m.html, 'href="https://stridetail.app/report/abc123"');
  assertStringIncludes(m.html, 'View the report card');
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
  assertStringIncludes(m.html, 'href="https://stridetail.app/invoice/tok789"');
  assertStringIncludes(m.html, 'View &amp; pay');
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

Deno.test('client_invite subject, warm text, and portal link from the payload', () => {
  const m = renderEmail('client_invite', { ...ctx, portalUrl: 'https://stridetail.app/portal-login' })!;
  assertEquals(m.subject, 'Paw & Whisker invited you to their pet care portal');
  assertEquals(
    m.text,
    "Paw & Whisker invited you to their pet care portal — see your pet's visits, " +
      'report cards, and invoices in one place. Sign in with this email address: ' +
      'https://stridetail.app/portal-login',
  );
  assertStringIncludes(m.html, 'href="https://stridetail.app/portal-login"');
  assertStringIncludes(m.html, "You're invited to Paw &amp; Whisker's pet care portal");
});

Deno.test('client_invite without a payload url falls back to the hosted portal login', () => {
  const m = renderEmail('client_invite', { ...ctx, portalUrl: undefined })!;
  assertStringIncludes(m.text, 'https://stridetail.app/portal-login');
  assertStringIncludes(m.html, 'href="https://stridetail.app/portal-login"');
});

// ===== Plan 8 Task 7: booking request emails =====

Deno.test('booking_request_received subject and body carry client, service, window', () => {
  const m = renderEmail('booking_request_received', {
    ...ctx,
    clientName: 'Karla',
    requestWindow: 'Thu, Aug 27, 2:00 PM – 4:00 PM',
  })!;
  assertEquals(m.subject, 'Paw & Whisker: new service request from Karla');
  assertEquals(
    m.text,
    'Paw & Whisker: Karla requested a Walk visit for Thu, Aug 27, 2:00 PM – 4:00 PM. ' +
      'Open Stridetail to approve or decline.',
  );
  assertStringIncludes(m.html, 'Karla requested a Walk visit');
});

Deno.test('booking_request_received without a name/window degrades honestly', () => {
  const m = renderEmail('booking_request_received', ctx)!;
  assertEquals(m.subject, 'Paw & Whisker: new service request from a client');
  assertEquals(
    m.text,
    'Paw & Whisker: A client requested a Walk visit. Open Stridetail to approve or decline.',
  );
});

Deno.test('booking_request_approved is warm and carries the scheduled date', () => {
  const m = renderEmail('booking_request_approved', {
    ...ctx,
    scheduledStart: 'Thu, Aug 27, 2:00 PM',
  })!;
  assertEquals(m.subject, 'Paw & Whisker: your Walk request is approved');
  assertEquals(
    m.text,
    'Good news from Paw & Whisker — your Walk request is approved! ' +
      'Your visit is scheduled for Thu, Aug 27, 2:00 PM. We look forward to seeing your pet.',
  );
  assertStringIncludes(m.html, 'Your visit is scheduled for Thu, Aug 27, 2:00 PM.');
});

Deno.test('booking_request_approved without a schedule label degrades honestly', () => {
  const m = renderEmail('booking_request_approved', ctx)!;
  assertStringIncludes(m.text, 'Your visit is on the calendar.');
});

Deno.test('booking_request_declined includes the reason', () => {
  const m = renderEmail('booking_request_declined', {
    ...ctx,
    declineReason: 'Fully booked that day',
  })!;
  assertEquals(m.subject, 'Paw & Whisker: about your Walk request');
  assertEquals(
    m.text,
    "Paw & Whisker couldn't fit your Walk request this time. " +
      'Reason: Fully booked that day. Please try another day or time.',
  );
  assertStringIncludes(m.html, 'Reason: Fully booked that day.');
});

Deno.test('booking_request_declined without a reason degrades honestly', () => {
  const m = renderEmail('booking_request_declined', ctx)!;
  assertEquals(
    m.text,
    "Paw & Whisker couldn't fit your Walk request this time. Please try another day or time.",
  );
});

Deno.test('formatInstant renders in the given zone, plain spaces only', () => {
  assertEquals(formatInstant('2026-08-27T19:00:00Z', 'America/Chicago'), 'Thu, Aug 27, 2:00 PM');
  // Bad input falls back to the raw string rather than lying or throwing.
  assertEquals(formatInstant('not-a-date', 'America/Chicago'), 'not-a-date');
  assertEquals(formatInstant('2026-08-27T19:00:00Z', 'Not/AZone'), '2026-08-27T19:00:00Z');
});

Deno.test('formatWindow renders start day + both times, end time-only', () => {
  assertEquals(
    formatWindow('2026-08-27T19:00:00Z', '2026-08-27T21:00:00Z', 'America/Chicago'),
    'Thu, Aug 27, 2:00 PM – 4:00 PM',
  );
  assertEquals(
    formatWindow('2026-08-27T19:00:00Z', 'bad', 'America/Chicago'),
    'Thu, Aug 27, 2:00 PM',
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

// ===== 2026-08-30 white-label shell =====
Deno.test('safeBrandColor accepts hex, rejects style injection', async () => {
  const { safeBrandColor, DEFAULT_BRAND_COLOR } = await import('./templates.ts');
  assertEquals(safeBrandColor('#3A7D5C'), '#3A7D5C');
  assertEquals(safeBrandColor('#abc'), '#abc');
  assertEquals(safeBrandColor(undefined), DEFAULT_BRAND_COLOR);
  assertEquals(safeBrandColor('red;background:url(x)'), DEFAULT_BRAND_COLOR);
});

Deno.test('branded shell uses the business brand color and footer', () => {
  const m = renderEmail('visit_started', { ...ctx, brandColor: '#3A7D5C' })!;
  assertStringIncludes(m.html, 'background:#3A7D5C');
  assertStringIncludes(m.html, 'Powered by');
  assertStringIncludes(m.html, 'https://stridetail.com');
});
