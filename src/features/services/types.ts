/** Mirrors public.services (supabase/migrations/20260823000001_core.sql). */

export type ServiceKind =
  | 'meet_greet'
  | 'walk'
  | 'dropin'
  | 'meds'
  | 'overnight'
  | 'transport'
  | 'grooming'
  | 'other';

export type Service = {
  id: string;
  business_id: string;
  name: string;
  kind: ServiceKind;
  base_price_cents: number;
  extra_pet_price_cents: number;
  duration_min: number;
  requires_gps: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** Caller-writable columns; business_id is supplied by the api functions. */
export type ServiceInput = {
  name: string;
  kind: ServiceKind;
  duration_min: number;
  base_price_cents?: number;
  extra_pet_price_cents?: number;
  requires_gps?: boolean;
  active?: boolean;
};
