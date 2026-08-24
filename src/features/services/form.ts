/** Pure helpers for the service editor (tested in __tests__/form.test.ts). */

import type { ServiceKind } from './types';

/** Kind choices for the editor's button row, in display order. */
export const SERVICE_KINDS: { value: ServiceKind; label: string }[] = [
  { value: 'walk', label: 'Walk' },
  { value: 'dropin', label: 'Drop-in' },
  { value: 'meds', label: 'Meds' },
  { value: 'meet_greet', label: 'Meet & greet' },
  { value: 'overnight', label: 'Overnight' },
  { value: 'transport', label: 'Transport' },
  { value: 'grooming', label: 'Grooming' },
  { value: 'other', label: 'Other' },
];

export function kindLabel(kind: ServiceKind): string {
  return SERVICE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** 2500 → "25.00". Always two decimals so the editor prefill round-trips. */
export function centsToDollarsString(cents: number): string {
  const dollars = Math.trunc(cents / 100);
  const rem = Math.abs(cents % 100);
  return `${dollars}.${String(rem).padStart(2, '0')}`;
}

/**
 * "12" | "12.5" | "12.50" (optional leading $, surrounding spaces) → cents.
 * Anything else — junk, negatives, >2 decimals, bare "." forms — is null.
 */
export function dollarsStringToCents(text: string): number | null {
  const m = /^\s*\$?\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const dollars = Number(m[1]);
  const frac = m[2] ?? '';
  const cents = frac.length === 0 ? 0 : frac.length === 1 ? Number(frac) * 10 : Number(frac);
  return dollars * 100 + cents;
}

/** Positive integer minutes only; null otherwise. */
export function parseDurationMin(text: string): number | null {
  const m = /^\s*(\d+)\s*$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export type ServiceFormValues = {
  name: string;
  kind: ServiceKind | null;
  durationMin: string;
  basePrice: string;
  extraPetPrice: string;
};

export type ServiceFormErrors = {
  name?: string;
  kind?: string;
  durationMin?: string;
  basePrice?: string;
  extraPetPrice?: string;
};

export function validateService(values: ServiceFormValues): ServiceFormErrors {
  const errors: ServiceFormErrors = {};
  if (!values.name.trim()) errors.name = 'Name is required';
  if (!values.kind) errors.kind = 'Pick a kind';
  if (parseDurationMin(values.durationMin) === null)
    errors.durationMin = 'Enter minutes greater than 0';
  if (dollarsStringToCents(values.basePrice) === null)
    errors.basePrice = 'Enter a price like 12.50';
  if (dollarsStringToCents(values.extraPetPrice) === null)
    errors.extraPetPrice = 'Enter a price like 12.50';
  return errors;
}
