// deno test supabase/functions/send-sms/templates.test.ts
//
// Pins the exact SMS bodies (the E2E fetch script and the sponsor's Twilio
// console both compare against these) and the retry backoff schedule.
import { assertEquals } from 'jsr:@std/assert@1';

import { backoffMinutes, MAX_ATTEMPTS, renderSms, SMS_TEMPLATES } from './templates.ts';

const ctx = {
  businessName: 'Paw & Whisker',
  petNames: 'Biscuit',
  serviceName: 'Walk',
  reportUrl: 'https://stridetail.app/report/abc123',
  inviteLink: 'stridetail://invite/tok456',
};

Deno.test('visit_started body', () => {
  assertEquals(
    renderSms('visit_started', ctx),
    "Paw & Whisker: Walker has started Biscuit's Walk visit.",
  );
});

Deno.test('visit_finished body carries the report link', () => {
  assertEquals(
    renderSms('visit_finished', ctx),
    "Paw & Whisker: Walker has finished Biscuit's Walk visit. Report: https://stridetail.app/report/abc123",
  );
});

Deno.test('invite body carries the invite link', () => {
  assertEquals(
    renderSms('invite', ctx),
    'Paw & Whisker invited you to join their team on Stridetail: stridetail://invite/tok456',
  );
});

Deno.test('multi-pet names read naturally', () => {
  assertEquals(
    renderSms('visit_started', { ...ctx, petNames: 'Biscuit & Max' }),
    "Paw & Whisker: Walker has started Biscuit & Max's Walk visit.",
  );
});

Deno.test('unknown template renders null (permanent failure upstream)', () => {
  assertEquals(renderSms('password_reset', ctx), null);
  assertEquals(Object.keys(SMS_TEMPLATES).sort(), ['invite', 'visit_finished', 'visit_started']);
});

Deno.test('backoff schedule: 1, 5, 15, then hourly; 6 attempts is terminal', () => {
  assertEquals([1, 2, 3, 4, 5, 6].map(backoffMinutes), [1, 5, 15, 60, 60, 60]);
  assertEquals(backoffMinutes(0), 1); // clamped
  assertEquals(backoffMinutes(99), 60); // clamped
  assertEquals(MAX_ATTEMPTS, 6);
});
