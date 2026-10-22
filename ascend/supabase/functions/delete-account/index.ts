// Permanently deletes the calling user's account. All player tables reference
// auth.users with ON DELETE CASCADE, so every row is removed with the user.
// The service-role key is injected by Supabase and never leaves the server.

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const del = await admin.auth.admin.deleteUser(data.user.id);
  if (del.error) return new Response(JSON.stringify({ error: 'delete failed' }), { status: 500, headers: cors });
  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
