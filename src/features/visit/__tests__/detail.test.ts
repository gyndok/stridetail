import { VISIT_STATUSES, type VisitStatus } from '@/src/lib/schedule/machine';

import {
  VISIT_CLIENT_COLUMNS,
  VISIT_PET_COLUMNS,
  VISIT_SERVICE_COLUMNS,
  canStart,
  fetchVisitDetail,
  mapsUrl,
  orderPets,
  petInstructionRows,
  vetLine,
} from '../detail';

// ---- chain-recorder mock with per-table results (fetchVisitDetail hits four tables) ----

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResults: Record<string, { data: unknown; error: unknown }> = {};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'single', 'maybeSingle']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve(mockResults[table] ?? { data: null, error: null }));
      return builder;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResults = {};
});

function tableEntry(table: string) {
  const entry = mockLog.find((e) => e.table === table);
  expect(entry).toBeDefined();
  return entry!;
}
function argsOf(table: string, name: string) {
  return tableEntry(table)
    .steps.filter(([n]) => n === name)
    .map(([, a]) => a);
}

const visitRow = {
  id: 'v1',
  business_id: 'b1',
  client_id: 'c1',
  service_id: 's1',
  series_id: null,
  walker_id: 'w1',
  pet_ids: ['p2', 'p1'],
  scheduled_start: '2026-08-24T14:00:00.000Z',
  scheduled_end: '2026-08-24T14:30:00.000Z',
  business_tz: 'America/Chicago',
  status: 'accepted',
  // owner_notes_md / decline_reason are NOT in the visits select anymore
  // (2026-08-29 security) — they arrive via the visit_private_fields view.
  started_at: null,
  finished_at: null,
  client: { name: 'Dana' },
};

function seedHappyPath() {
  mockResults = {
    visits: { data: visitRow, error: null },
    visit_private_fields: {
      data: { owner_notes_md: 'gate code on the side door', decline_reason: null },
      error: null,
    },
    clients: {
      data: { id: 'c1', name: 'Dana', phones: ['+15550001'], address: '1 Main St', notes_md: 'ring twice' },
      error: null,
    },
    pets: {
      data: [
        { id: 'p1', name: 'Rex', species: 'Dog', breed: null, feeding_md: null, meds_md: null,
          allergies: null, reactivity_md: null, vet_name: null, vet_phone: null, vet_address: null,
          photo_path: null },
        { id: 'p2', name: 'Ada', species: 'Dog', breed: 'Lab', feeding_md: '1 cup', meds_md: null,
          allergies: 'chicken', reactivity_md: 'wary of bikes', vet_name: 'Dr. Vet', vet_phone: '+15550002',
          vet_address: null, photo_path: 'b1/pets/p2/photo.jpg' },
      ],
      error: null,
    },
    services_public: {
      data: { id: 's1', name: '30-min walk', duration_min: 30, requires_gps: true },
      error: null,
    },
  };
}

// ---- query shape ----

test('fetchVisitDetail reads the visit by id with MY_VISIT_COLUMNS (named columns, no price)', async () => {
  seedHappyPath();
  await fetchVisitDetail('v1');
  const selects = argsOf('visits', 'select');
  expect(selects).toHaveLength(1);
  const cols = selects[0]![0] as string;
  expect(cols).not.toContain('*');
  expect(cols).not.toContain('price');
  // Walker read path: no services embed (owner-only policy), client embed kept.
  expect(cols).not.toContain('service:services');
  expect(cols).toContain('client:clients(name)');
  expect(argsOf('visits', 'eq')).toEqual([['id', 'v1']]);
  expect(argsOf('visits', 'single')).toHaveLength(1);
});

test('fetchVisitDetail loads client, pets, and service with named columns scoped to the visit', async () => {
  seedHappyPath();
  await fetchVisitDetail('v1');
  expect(argsOf('clients', 'select')).toEqual([[VISIT_CLIENT_COLUMNS]]);
  expect(argsOf('clients', 'eq')).toEqual([['id', 'c1']]);
  expect(argsOf('clients', 'maybeSingle')).toHaveLength(1);

  expect(argsOf('pets', 'select')).toEqual([[VISIT_PET_COLUMNS]]);
  expect(argsOf('pets', 'in')).toEqual([['id', ['p2', 'p1']]]);

  expect(argsOf('services_public', 'select')).toEqual([[VISIT_SERVICE_COLUMNS]]);
  expect(argsOf('services_public', 'eq')).toEqual([['id', 's1']]);
  expect(argsOf('services_public', 'maybeSingle')).toHaveLength(1);
});

test('column constants name their fields and include the instruction/gps columns', () => {
  for (const cols of [VISIT_CLIENT_COLUMNS, VISIT_PET_COLUMNS, VISIT_SERVICE_COLUMNS]) {
    expect(cols).not.toContain('*');
  }
  for (const c of ['name', 'phones', 'address', 'notes_md', 'marketing_photos_ok']) {
    expect(VISIT_CLIENT_COLUMNS).toContain(c);
  }
  for (const c of ['feeding_md', 'meds_md', 'allergies', 'reactivity_md', 'vet_name', 'vet_phone',
    'vet_address', 'photo_path']) {
    expect(VISIT_PET_COLUMNS).toContain(c);
  }
  expect(VISIT_SERVICE_COLUMNS).toContain('requires_gps');
});

test('fetchVisitDetail assembles the detail: service joined onto the visit, pets in pet_ids order', async () => {
  seedHappyPath();
  const detail = await fetchVisitDetail('v1');
  expect(detail.visit.id).toBe('v1');
  // Private fields merged from the staff-only view onto the visit.
  expect(detail.visit.owner_notes_md).toBe('gate code on the side door');
  expect(argsOf('visit_private_fields', 'eq')).toEqual([['visit_id', 'v1']]);
  expect(detail.visit.service).toEqual({ name: '30-min walk', duration_min: 30 });
  expect(detail.service).toEqual({ id: 's1', name: '30-min walk', duration_min: 30, requires_gps: true });
  expect(detail.client?.name).toBe('Dana');
  expect(detail.pets.map((p) => p.id)).toEqual(['p2', 'p1']); // pet_ids order, not row order
});

test('fetchVisitDetail tolerates missing client/service rows (null) and empty pets', async () => {
  seedHappyPath();
  mockResults.clients = { data: null, error: null };
  mockResults.services_public = { data: null, error: null };
  mockResults.pets = { data: [], error: null };
  const detail = await fetchVisitDetail('v1');
  expect(detail.client).toBeNull();
  expect(detail.service).toBeNull();
  expect(detail.visit.service).toBeNull();
  expect(detail.pets).toEqual([]);
});

test('fetchVisitDetail throws on a visit error', async () => {
  mockResults = { visits: { data: null, error: new Error('boom') } };
  await expect(fetchVisitDetail('v1')).rejects.toThrow('boom');
});

// ---- canStart gate (mirror of accepted -> in_progress in the machine) ----

test('canStart allows exactly the accepted status', () => {
  const allowed = VISIT_STATUSES.filter((s) => canStart(s).ok);
  expect(allowed).toEqual(['accepted']);
});

test.each([
  ['offered', /accept/i],
  ['unassigned', /not assigned/i],
  ['in_progress', /in progress/i],
  ['completed', /completed/i],
  ['cancelled', /cancelled/i],
] as [VisitStatus, RegExp][])('canStart(%s) explains why not', (status, pattern) => {
  const gate = canStart(status);
  expect(gate.ok).toBe(false);
  if (!gate.ok) expect(gate.reason).toMatch(pattern);
});

// ---- instructions assembly ----

const basePet = {
  id: 'p1', name: 'Rex', species: 'Dog', breed: null, feeding_md: null, meds_md: null,
  allergies: null, reactivity_md: null, vet_name: null, vet_phone: null, vet_address: null,
  photo_path: null,
};

test('petInstructionRows lists only the fields that are present, in a stable order', () => {
  const rows = petInstructionRows({
    ...basePet,
    feeding_md: '1 cup, morning',
    allergies: 'chicken',
    vet_name: 'Dr. Vet',
    vet_phone: '+15550002',
  });
  expect(rows).toEqual([
    { label: 'Feeding', value: '1 cup, morning' },
    { label: 'Allergies', value: 'chicken' },
    { label: 'Vet', value: 'Dr. Vet · +15550002' },
  ]);
});

test('petInstructionRows is empty when nothing is on file', () => {
  expect(petInstructionRows(basePet)).toEqual([]);
});

test('petInstructionRows includes meds when present', () => {
  const rows = petInstructionRows({ ...basePet, meds_md: 'insulin 2u with dinner' });
  expect(rows).toEqual([{ label: 'Medications', value: 'insulin 2u with dinner' }]);
});

test('vetLine joins the present vet fields and is null with none', () => {
  expect(vetLine(basePet)).toBeNull();
  expect(vetLine({ ...basePet, vet_name: 'Dr. Vet', vet_address: '2 Elm St' })).toBe('Dr. Vet · 2 Elm St');
});

// ---- orderPets ----

test('orderPets returns rows in pet_ids order and appends unlisted rows', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  expect(orderPets(rows, ['c', 'a']).map((p) => p.id)).toEqual(['c', 'a', 'b']);
});

test('orderPets drops ids with no row', () => {
  expect(orderPets([{ id: 'a' }], ['missing', 'a']).map((p) => p.id)).toEqual(['a']);
});

// ---- mapsUrl ----

test('mapsUrl encodes the address into a maps query link', () => {
  expect(mapsUrl('1 Main St #2, Austin')).toBe(
    'https://maps.google.com/?q=1%20Main%20St%20%232%2C%20Austin',
  );
});

test('mapsUrl trims surrounding whitespace', () => {
  expect(mapsUrl('  1 Main St ')).toBe('https://maps.google.com/?q=1%20Main%20St');
});
