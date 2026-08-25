import { Platform } from 'react-native';

import {
  finishedNoLinkSmsBody,
  joinPetNames,
  reportSmsBody,
  sanitizeSmsPhone,
  smsUrl,
  startedSmsBody,
} from '../deviceSms';

// ---- smsUrl: platform-dependent body separator ----

test('iOS composer URL uses the & separator', () => {
  expect(smsUrl('+15550001111', 'Hi there', 'ios')).toBe('sms:+15550001111&body=Hi%20there');
});

test('Android composer URL uses the ? separator', () => {
  expect(smsUrl('+15550001111', 'Hi there', 'android')).toBe('sms:+15550001111?body=Hi%20there');
});

test('default platform comes from Platform.OS (ios)', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  expect(smsUrl('+15550001111', 'x')).toBe('sms:+15550001111&body=x');
});

test('default platform comes from Platform.OS (android)', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(smsUrl('+15550001111', 'x')).toBe('sms:+15550001111?body=x');
});

test('body is URL-encoded (ampersands, colons, slashes survive the composer)', () => {
  const url = smsUrl('+15550001111', 'Paw & Whisker: https://stridetail.app/report/abc', 'ios');
  expect(url).toBe(
    'sms:+15550001111&body=Paw%20%26%20Whisker%3A%20https%3A%2F%2Fstridetail.app%2Freport%2Fabc',
  );
});

test('phone is normalized like telUrl (digits + leading +)', () => {
  expect(sanitizeSmsPhone('(555) 000-1111')).toBe('5550001111');
  expect(sanitizeSmsPhone('+1 (555) 000-1111')).toBe('+15550001111');
  expect(smsUrl('(555) 000-1111', 'x', 'android')).toBe('sms:5550001111?body=x');
});

// ---- bodies: pinned to supabase/functions/send-sms/templates.ts wording ----

test('startedSmsBody matches the visit_started SMS template', () => {
  expect(startedSmsBody('Paw & Whisker', 'Biscuit', 'Walk')).toBe(
    "Paw & Whisker: Walker has started Biscuit's Walk visit.",
  );
});

test('reportSmsBody matches the visit_finished SMS template', () => {
  expect(reportSmsBody('Paw & Whisker', 'Biscuit', 'Walk', 'https://stridetail.app/report/abc123')).toBe(
    "Paw & Whisker: Walker has finished Biscuit's Walk visit. Report: https://stridetail.app/report/abc123",
  );
});

test('multi-pet names read naturally', () => {
  expect(startedSmsBody('Paw & Whisker', 'Biscuit & Max', 'Walk')).toBe(
    "Paw & Whisker: Walker has started Biscuit & Max's Walk visit.",
  );
});

test('finishedNoLinkSmsBody defers the link honestly (offline walker path)', () => {
  expect(finishedNoLinkSmsBody('Paw & Whisker', 'Biscuit')).toBe(
    "Paw & Whisker: Biscuit's visit is finished — report link coming separately.",
  );
});

// ---- joinPetNames: mirrors the send-sms buildContext fallback ----

test('joinPetNames joins with & and falls back to "your pet"', () => {
  expect(joinPetNames(['Biscuit'])).toBe('Biscuit');
  expect(joinPetNames(['Biscuit', 'Max'])).toBe('Biscuit & Max');
  expect(joinPetNames([])).toBe('your pet');
});
