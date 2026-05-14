import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendEmailRequest {
  trigger_key: string
  user_id?: string
  recipient_email?: string
  variables?: Record<string, string>
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// B03-A06: escape user-supplied variables before injecting into HTML bodies
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // B03-A05: require internal secret — this function must only be called by other Edge Functions,
    // never directly from the browser. Set INTERNAL_SECRET in Supabase Edge Function secrets.
    const internalSecret = Deno.env.get('INTERNAL_SECRET')
    const callerSecret = req.headers.get('x-internal-secret')
    if (!internalSecret || callerSecret !== internalSecret) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) throw new Error('RESEND_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { trigger_key, user_id, recipient_email, variables = {} }: SendEmailRequest = await req.json()

    // Fetch template
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('trigger_key', trigger_key)
      .eq('is_active', true)
      .single()

    if (!template) {
      return new Response(JSON.stringify({ error: `Template '${trigger_key}' not found` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve recipient
    let to = recipient_email
    let name = variables.name ?? 'Cliente'

    if (user_id && !to) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', user_id)
        .single()

      if (profile) {
        to = profile.email
        name = profile.full_name
      }
    }

    if (!to) {
      return new Response(JSON.stringify({ error: 'No recipient email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const mergedVars = { name, ...variables }

    // B03-A06: subject is plain text — use raw vars to avoid showing &amp; etc.
    //          body is rendered HTML — escape vars to prevent XSS injection.
    const subject = interpolate(template.subject_pt, mergedVars)
    const safeVars = Object.fromEntries(
      Object.entries(mergedVars).map(([k, v]) => [k, escapeHtml(v)]),
    )
    const bodyHtml = interpolate(template.body_html_pt, safeVars)

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Doutor Imigrante <noreply@mail.drimigrante.com>',
        to: [to],
        subject,
        html: bodyHtml,
      }),
    })

    const resendJson = await resendRes.json()
    const status = resendRes.ok ? 'sent' : 'failed'

    // Log
    await supabase.from('email_send_log').insert({
      template_id: template.id,
      user_id: user_id ?? null,
      recipient_email: to,
      subject,
      body_html: bodyHtml,
      provider: 'resend',
      provider_message_id: resendJson.id ?? null,
      status,
      error_message: resendRes.ok ? null : JSON.stringify(resendJson),
      variables_used: mergedVars,
      sent_at: new Date().toISOString(),
    })

    if (!resendRes.ok) {
      throw new Error(`Resend error: ${JSON.stringify(resendJson)}`)
    }

    return new Response(JSON.stringify({ success: true, message_id: resendJson.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    // B03-A07: never leak internal error details to the caller
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
