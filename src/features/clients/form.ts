/** Pure helpers for the client form and detail screen (tested in __tests__/form.test.ts). */

/** Comma-separated phones field → text[]: split, trim, drop empties. */
export function parsePhones(text: string): string[] {
  return text
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** text[] → comma-separated field value for prefilling the form. */
export function phonesToText(phones: string[] | null | undefined): string {
  return (phones ?? []).join(', ');
}

export type ClientFormErrors = { name?: string; email?: string };

/** Name is required; email is optional but must look like an email when present. */
export function validateClient(values: { name: string; email: string }): ClientFormErrors {
  const errors: ClientFormErrors = {};
  if (!values.name.trim()) errors.name = 'Name is required';
  const email = values.email.trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Enter a valid email';
  return errors;
}

/** tel: URL for Linking.openURL — non-digits stripped, a leading + kept. */
export function telUrl(phone: string): string {
  const kept = phone.replace(/[^\d+]/g, '');
  const plus = kept.startsWith('+') ? '+' : '';
  return `tel:${plus}${kept.replace(/\+/g, '')}`;
}

/**
 * Geocode on save only when it can change the outcome: address present and
 * either new/changed, or unchanged but a previous geocode left no pin.
 */
export function needsGeocode(
  address: string | null,
  initial?: { address: string | null; lat: number | null },
): boolean {
  if (!address) return false;
  if (!initial) return true;
  return address !== initial.address || initial.lat === null;
}
