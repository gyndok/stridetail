/** Mirrors public.clients (supabase/migrations/20260824000001_clients_pets.sql). */
export type Client = {
  id: string;
  business_id: string;
  name: string;
  phones: string[];
  email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes_md: string | null;
  mg_completed_at: string | null;
  /** Stamped by invite_client_to_portal (Plan 8 Task 3); null = never invited. */
  portal_invited_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Shape of a `pets(count)` embed: supabase returns one row holding the count. */
export type CountEmbed = { count: number }[];

/** Row shape returned by listClients (list screen needs only these columns;
    lat/lng feed the new-visit picker's tight-transfer flag). */
export type ClientListItem = Pick<Client, 'id' | 'name' | 'phones' | 'mg_completed_at' | 'lat' | 'lng'> & {
  pets: CountEmbed;
};

/** Full row plus pets count, returned by getClient. */
export type ClientDetail = Client & { pets: CountEmbed };

/** Caller-writable columns; business_id is supplied by the api functions. */
export type ClientInput = {
  name: string;
  phones?: string[];
  email?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes_md?: string | null;
  mg_completed_at?: string | null;
};
