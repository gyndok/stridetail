import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { backoffMinutes, renderPush } from './templates.ts';

Deno.test('visit_offered renders pets, service, and time', () => {
  const m = renderPush('visit_offered', {
    petNames: 'Olivia',
    serviceName: 'Walk',
    whenLocal: 'Thu, Sep 4, 3:00 PM',
  })!;
  assertEquals(m.title, 'New visit offer');
  assertStringIncludes(m.body, 'Olivia · Walk');
  assertStringIncludes(m.body, 'accept or decline');
});

Deno.test('visit_declined carries the walker and reason; degrades without them', () => {
  const m = renderPush('visit_declined', { walkerName: 'Kelly Whipple', reason: 'car trouble' })!;
  assertStringIncludes(m.body, 'Kelly Whipple declined');
  assertStringIncludes(m.body, '"car trouble"');
  const bare = renderPush('visit_declined', {})!;
  assertStringIncludes(bare.body, 'A walker declined');
});

Deno.test('booking_request names the client; unknown templates are null', () => {
  const m = renderPush('booking_request', { clientName: 'Rita Justice' })!;
  assertStringIncludes(m.body, 'Rita Justice requested');
  assertEquals(renderPush('nonsense', {}), null);
});

Deno.test('backoff follows the 1/5/15/60 ladder and caps', () => {
  assertEquals(backoffMinutes(1), 1);
  assertEquals(backoffMinutes(2), 5);
  assertEquals(backoffMinutes(3), 15);
  assertEquals(backoffMinutes(4), 60);
  assertEquals(backoffMinutes(99), 60);
});
