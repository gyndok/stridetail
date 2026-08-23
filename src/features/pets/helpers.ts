/** Pure helpers for the pet form and profile screen (tested in __tests__/helpers.test.ts). */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse 'YYYY-MM-DD' into calendar parts; null when malformed or not a real date. */
export function parseDateOnly(value: string): { y: number; m: number; d: number } | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  // Round-trip through a Date to reject impossible dates like 2023-02-30.
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return { y, m, d };
}

/**
 * Human age line for a pet: '3 y' from the first birthday on, '8 mo' before it.
 * Pure calendar math on date parts — no time zone is consulted (the birthdate
 * column is date-only, and `now` supplies the local calendar day).
 * Null when the birthdate is missing, malformed, or in the future.
 */
export function petAge(birthdate: string | null | undefined, now: Date = new Date()): string | null {
  if (!birthdate) return null;
  const b = parseDateOnly(birthdate);
  if (!b) return null;
  let months = (now.getFullYear() - b.y) * 12 + (now.getMonth() + 1 - b.m);
  if (now.getDate() < b.d) months -= 1;
  if (months < 0) return null;
  if (months >= 12) return `${Math.floor(months / 12)} y`;
  return `${months} mo`;
}

/** Object path in the `media` bucket; first segment must be the business id (storage RLS). */
export function storagePetPhotoPath(businessId: string, petId: string): string {
  return `${businessId}/pets/${petId}/photo.jpg`;
}

export type PetFormErrors = { name?: string; species?: string; birthdate?: string };

/** Name and species are required; birthdate is optional but must be a real YYYY-MM-DD. */
export function validatePet(values: {
  name: string;
  species: string;
  birthdate: string;
}): PetFormErrors {
  const errors: PetFormErrors = {};
  if (!values.name.trim()) errors.name = 'Name is required';
  if (!values.species.trim()) errors.species = 'Species is required';
  const birthdate = values.birthdate.trim();
  if (birthdate && !parseDateOnly(birthdate)) errors.birthdate = 'Use YYYY-MM-DD';
  return errors;
}
