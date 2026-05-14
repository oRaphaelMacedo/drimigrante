// e2e-login — generates a session for Playwright E2E tests.
//
// Disabled unless E2E_MODE === 'true'. Requires a matching INTERNAL_SECRET
// in the `x-internal-secret` request header. NEVER set E2E_MODE=true in production.
//
// Flow:
//   1. Verify E2E_MODE and INTERNAL_SECRET.
//   2. Create the user if missing (idempotent).
//   3. Generate a magic-link token via admin.generateLink.
//   4. Exchange the token for a real session via auth.verifyOtp.
//   5. Return { access_token, refresh_token, user } to the caller.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  email: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (Deno.env.get('E2E_MODE') !== 'true') {
    return new Response(JSON.stringify({ error: 'Disabled' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const internalSecret = Deno.env.get('INTERNAL_SECRET')
  if (!internalSecret || req.headers.get('x-internal-secret') !== internalSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!body.email || typeof body.email !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing email' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Idempotent user creation — ignore "already registered" errors.
    const { error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      email_confirm: true,
    })
    if (createErr && !/already (registered|exists)/i.test(createErr.message)) {
      throw createErr
    }

    // Generate a one-shot magic-link token.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: body.email,
    })
    if (linkErr) throw linkErr
    const hashedToken = (linkData as { properties?: { hashed_token?: string } }).properties?.hashed_token
    if (!hashedToken) {
      throw new Error('generateLink returned no hashed_token')
    }

    // Exchange the token for a real session. Uses anon key — verifyOtp is public.
    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: sessionData, error: verifyErr } = await client.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    })
    if (verifyErr) throw verifyErr
    if (!sessionData.session) {
      throw new Error('verifyOtp returned no session')
    }

    return new Response(
      JSON.stringify({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user: { id: sessionData.user?.id, email: sessionData.user?.email },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
