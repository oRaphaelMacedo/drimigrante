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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
    const subject = interpolate(template.subject_pt, mergedVars)
    const bodyHtml = interpolate(template.body_html_pt, mergedVars)

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
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
