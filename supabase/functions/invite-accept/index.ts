// Accepts an invitation on behalf of the signed-in user.
// POST { token } with the user's JWT → { businessId }.
// The service-role key is read only here (edge-function env), never in app/ or src/.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'misconfigured' }, 500);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'unauthorized' }, 401);

  const body: unknown = await req.json().catch(() => null);
  const token = body && typeof body === 'object' ? (body as { token?: unknown }).token : undefined;
  if (typeof token !== 'string' || token.length < 16) return json({ error: 'bad token' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('accept_invite', { p_token: token, p_user: user.id });
  if (error) return json({ error: error.message }, 400);
  return json({ businessId: data });
});
