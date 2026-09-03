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

// ---- age-first entry (beta round 3, 2026-09-02: "a lot of people don't
// know their dog's birthday"). The form asks for an AGE; we derive an
// approximate birthdate (today minus the duration) because the column, the
// vaccine logic, and the display all key off birthdate. An exact YYYY-MM-DD
// still works for the clients who do know it. ----

const YEARS_RE = /^(\d+(?:\.\d+)?)\s*(?:y|yr|yrs|year|years)?$/i;
const MONTHS_RE = /^(\d+(?:\.\d+)?)\s*(?:mo|mos|m|month|months)$/i;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date-only string for (now minus N months), day clamped to the target month. */
function monthsAgoYmd(months: number, now: Date): string {
  const total = now.getFullYear() * 12 + now.getMonth() - months;
  const y = Math.floor(total / 12);
  const m = total - y * 12; // 0-based
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const d = Math.min(now.getDate(), daysInMonth);
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

/**
 * Turn a human age entry into a birthdate string. Accepts an exact
 * 'YYYY-MM-DD', years ('3', '3.5', '3 y', '2 years'), or months
 * ('8 mo', '10 months'). Null when the text is unparsable or the exact
 * date is invalid/in the future. Blank input is the caller's concern.
 */
export function birthdateFromAgeInput(text: string, now: Date = new Date()): string | null {
  const s = text.trim();
  if (DATE_ONLY.test(s)) {
    const p = parseDateOnly(s);
    if (!p) return null;
    return new Date(p.y, p.m - 1, p.d) > now ? null : s;
  }
  const months = MONTHS_RE.exec(s);
  if (months) return monthsAgoYmd(Math.round(Number(months[1])), now);
  const years = YEARS_RE.exec(s);
  if (years) return monthsAgoYmd(Math.round(Number(years[1]) * 12), now);
  return null;
}

export type PetFormErrors = { name?: string; species?: string; age?: string };

/** Name and species are required; age is optional but must parse when present. */
export function validatePet(values: {
  name: string;
  species: string;
  age: string;
}): PetFormErrors {
  const errors: PetFormErrors = {};
  if (!values.name.trim()) errors.name = 'Name is required';
  if (!values.species.trim()) errors.species = 'Species is required';
  const age = values.age.trim();
  if (age && birthdateFromAgeInput(age) === null) {
    errors.age = 'Try an age like 3, 8 mo — or a birthday like 2023-03-10';
  }
  return errors;
}
