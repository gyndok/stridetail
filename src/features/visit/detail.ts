import { MY_VISIT_COLUMNS, type Visit } from '@/src/features/schedule/api';
import { canTransition, type VisitStatus } from '@/src/lib/schedule/machine';
import { supabase } from '@/src/lib/supabase';

/**
 * Walker visit detail (Plan 4 Task 4). One fetch assembles everything the
 * pre-start screen needs: the visit row (walker RLS pins it to the assignee),
 * the client's contact/notes, the pets' care instructions, and the service via
 * the price-free `services_public` definer view (the `services` select policy
 * is owner-only, so no embed — see MY_VISIT_COLUMNS). The Plan-3 Task-2 walker
 * visibility policies cover the client/pets reads.
 *
 * COLUMN-GRANT RULE: every visits read names columns (price_cents_snapshot has
 * no select grant for any client role) — MY_VISIT_COLUMNS satisfies this.
 */

export type VisitClientInfo = {
  id: string;
  name: string;
  phones: string[];
  address: string | null;
  notes_md: string | null;
};

export type VisitPetInfo = {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  feeding_md: string | null;
  meds_md: string | null;
  allergies: string | null;
  reactivity_md: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  vet_address: string | null;
  photo_path: string | null;
};

export type VisitServiceInfo = {
  id: string;
  name: string;
  duration_min: number;
  requires_gps: boolean;
};

export type VisitDetail = {
  visit: Visit;
  client: VisitClientInfo | null;
  pets: VisitPetInfo[];
  service: VisitServiceInfo | null;
};

export const VISIT_CLIENT_COLUMNS = 'id, name, phones, address, notes_md';
export const VISIT_PET_COLUMNS =
  'id, name, species, breed, feeding_md, meds_md, allergies, reactivity_md, ' +
  'vet_name, vet_phone, vet_address, photo_path';
export const VISIT_SERVICE_COLUMNS = 'id, name, duration_min, requires_gps';

export async function fetchVisitDetail(visitId: string): Promise<VisitDetail> {
  // No business filter needed: walker RLS already pins visits to walker_id =
  // auth.uid(), and the id is unique.
  const { data, error } = await supabase
    .from('visits')
    .select(MY_VISIT_COLUMNS)
    .eq('id', visitId)
    .single();
  if (error) throw error;
  const v = data as unknown as Omit<Visit, 'service'>;

  const [clientRes, petsRes, serviceRes] = await Promise.all([
    supabase.from('clients').select(VISIT_CLIENT_COLUMNS).eq('id', v.client_id).maybeSingle(),
    supabase.from('pets').select(VISIT_PET_COLUMNS).in('id', v.pet_ids),
    supabase
      .from('services_public')
      .select(VISIT_SERVICE_COLUMNS)
      .eq('id', v.service_id)
      .maybeSingle(),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (petsRes.error) throw petsRes.error;
  if (serviceRes.error) throw serviceRes.error;

  const service = (serviceRes.data ?? null) as VisitServiceInfo | null;
  const visit: Visit = {
    ...v,
    service: service ? { name: service.name, duration_min: service.duration_min } : null,
  };
  return {
    visit,
    client: (clientRes.data ?? null) as VisitClientInfo | null,
    pets: orderPets((petsRes.data ?? []) as unknown as VisitPetInfo[], v.pet_ids),
    service,
  };
}

// ---- pure helpers (tested in __tests__/detail.test.ts) ----

/** Rows in pet_ids order; rows the ids don't mention are appended, unknown ids dropped. */
export function orderPets<T extends { id: string }>(pets: T[], petIds: string[]): T[] {
  const byId = new Map(pets.map((p) => [p.id, p]));
  const listed = new Set(petIds);
  const ordered = petIds.map((id) => byId.get(id)).filter((p): p is T => p != null);
  return [...ordered, ...pets.filter((p) => !listed.has(p.id))];
}

export type CanStart = { ok: true } | { ok: false; reason: string };

const NOT_STARTABLE: Record<VisitStatus, string> = {
  unassigned: 'This visit is not assigned to you.',
  offered: 'Accept this offer before starting the visit.',
  accepted: '', // startable — never read
  in_progress: 'This visit is already in progress.',
  completed: 'This visit is completed.',
  cancelled: 'This visit was cancelled.',
};

/**
 * Start gate: mirrors accepted -> in_progress in the status machine for the
 * assigned walker (the screen only ever shows the session walker's own visits).
 */
export function canStart(status: VisitStatus): CanStart {
  if (canTransition(status, 'in_progress', { role: 'walker', isAssignee: true })) {
    return { ok: true };
  }
  return { ok: false, reason: NOT_STARTABLE[status] || 'This visit cannot be started.' };
}

export type InstructionRow = { label: string; value: string };

/** Present-only vet summary: "name · phone · address" with absent parts dropped. */
export function vetLine(pet: Pick<VisitPetInfo, 'vet_name' | 'vet_phone' | 'vet_address'>): string | null {
  const parts = [pet.vet_name, pet.vet_phone, pet.vet_address].filter(
    (p): p is string => p != null && p !== '',
  );
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Instruction rows for one pet, present fields only, in a stable order:
 * Feeding, Medications, Allergies, Vet. Reactivity is rendered separately as a
 * warning card, not a row.
 */
export function petInstructionRows(
  pet: Pick<VisitPetInfo, 'feeding_md' | 'meds_md' | 'allergies' | 'vet_name' | 'vet_phone' | 'vet_address'>,
): InstructionRow[] {
  const rows: InstructionRow[] = [];
  if (pet.feeding_md) rows.push({ label: 'Feeding', value: pet.feeding_md });
  if (pet.meds_md) rows.push({ label: 'Medications', value: pet.meds_md });
  if (pet.allergies) rows.push({ label: 'Allergies', value: pet.allergies });
  const vet = vetLine(pet);
  if (vet) rows.push({ label: 'Vet', value: vet });
  return rows;
}

/** Display-only maps link for the client address (opens the platform maps app). */
export function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address.trim())}`;
}
