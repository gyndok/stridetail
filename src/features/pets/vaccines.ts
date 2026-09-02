// Required-vaccine gating (beta wish list #5, 2026-09-01).
//
// The business stores which doc_types it requires per species
// (businesses.required_vaccines jsonb, species-keyed). The New Visit screen
// computes issues for the selected pets and shows a WARNING — booking is never
// blocked; the owner is the one booking and the note is all Alexandra asked for.
import { supabase } from '@/src/lib/supabase';

import { DOC_TYPES, docTypeLabel, expiryState, type DocType, type PetDocument } from './documents';

/** Species-keyed required doc types, keys lowercased ('dog', 'cat'). */
export type RequiredVaccines = Record<string, DocType[]>;

/** Types that can be marked required — 'other' is a grab-bag, never requirable. */
export const REQUIRABLE_TYPES: readonly DocType[] = DOC_TYPES.filter((t) => t !== 'other');

/** The settings UI offers these species with the types that make sense for each. */
export const SPECIES_VACCINE_OPTIONS: readonly { species: string; label: string; types: DocType[] }[] = [
  { species: 'dog', label: 'Dogs', types: ['rabies', 'dhpp', 'lepto', 'bordetella'] },
  { species: 'cat', label: 'Cats', types: ['rabies', 'fvrcp'] },
];

export function normalizeSpecies(species: string | null | undefined): string | null {
  const s = species?.trim().toLowerCase();
  return s ? s : null;
}

/** Defensive parse of the jsonb column (unknown shape survives bad writes). */
export function parseRequiredVaccines(raw: unknown): RequiredVaccines {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RequiredVaccines = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const types = value.filter(
      (v): v is DocType => typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v),
    );
    const species = normalizeSpecies(key);
    if (species && types.length > 0) out[species] = types;
  }
  return out;
}

export type VaccineIssue = {
  petId: string;
  petName: string;
  type: DocType;
  status: 'missing' | 'expired';
};

type IssuePet = { id: string; name: string; species: string | null };
type IssueDoc = Pick<PetDocument, 'pet_id' | 'type' | 'expires_on'>;

/**
 * One issue per (pet, required type) that has NO usable document. A document
 * with no expiry date counts as on file (lenient — the certificate exists);
 * the type is 'expired' only when every document of that type has expired.
 */
export function vaccineIssues(
  pets: IssuePet[],
  docs: IssueDoc[],
  required: RequiredVaccines,
  now: Date = new Date(),
): VaccineIssue[] {
  const issues: VaccineIssue[] = [];
  for (const pet of pets) {
    const species = normalizeSpecies(pet.species);
    const types = species ? (required[species] ?? []) : [];
    for (const type of types) {
      const ofType = docs.filter((d) => d.pet_id === pet.id && d.type === type);
      if (ofType.length === 0) {
        issues.push({ petId: pet.id, petName: pet.name, type, status: 'missing' });
        continue;
      }
      const allExpired = ofType.every((d) => expiryState(d.expires_on, now) === 'expired');
      if (allExpired) issues.push({ petId: pet.id, petName: pet.name, type, status: 'expired' });
    }
  }
  return issues;
}

export function issueLabel(issue: VaccineIssue): string {
  const verb = issue.status === 'expired' ? 'expired' : 'missing';
  return `${docTypeLabel(issue.type)} ${verb} — ${issue.petName}`;
}

/** The booking screen's doc fetch: one query across all selected pets. */
export async function fetchVaccineDocs(businessId: string, petIds: string[]): Promise<IssueDoc[]> {
  if (petIds.length === 0) return [];
  const { data, error } = await supabase
    .from('pet_documents')
    .select('pet_id, type, expires_on')
    .eq('business_id', businessId)
    .in('pet_id', petIds);
  if (error) throw error;
  return (data ?? []) as IssueDoc[];
}

/** Owner settings write — the billing-settings/brand-color update pattern. */
export async function updateRequiredVaccines(
  businessId: string,
  value: RequiredVaccines,
): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({ required_vaccines: value })
    .eq('id', businessId);
  if (error) throw error;
}
