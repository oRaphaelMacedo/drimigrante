import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EligibilityRequest {
  assessment_id: string
}

// Minimal JSON-Logic evaluator for MVP
// Phase 2: use full json-logic-js library
function evaluateRule(rule: unknown, data: Record<string, unknown>): boolean {
  if (typeof rule !== 'object' || rule === null) return false

  const r = rule as Record<string, unknown>

  if ('and' in r && Array.isArray(r.and)) {
    return (r.and as unknown[]).every((sub) => evaluateRule(sub, data))
  }
  if ('or' in r && Array.isArray(r.or)) {
    return (r.or as unknown[]).some((sub) => evaluateRule(sub, data))
  }
  if ('>=' in r && Array.isArray(r['>='])) {
    const [a, b] = r['>='] as unknown[]
    return resolveValue(a, data) >= resolveValue(b, data)
  }
  if ('>' in r && Array.isArray(r['>'])) {
    const [a, b] = r['>'] as unknown[]
    return resolveValue(a, data) > resolveValue(b, data)
  }
  if ('in' in r && Array.isArray(r.in)) {
    const [val, arr] = r.in as unknown[]
    const resolved = resolveValue(val, data)
    return Array.isArray(arr) && arr.includes(resolved)
  }
  if ('==' in r && Array.isArray(r['=='])) {
    const [a, b] = r['=='] as unknown[]
    return resolveValue(a, data) === resolveValue(b, data)
  }

  return false
}

function resolveValue(v: unknown, data: Record<string, unknown>): unknown {
  if (typeof v === 'object' && v !== null && 'var' in (v as Record<string, unknown>)) {
    const key = (v as { var: string }).var
    return data[key]
  }
  return v
}

function calculateScore(answers: Record<string, unknown>, options: Array<{ question_key: string; option_key: string; score: number }>): number {
  let total = 0
  let maxPossible = 0

  const scoresByQuestion: Record<string, number> = {}
  const maxByQuestion: Record<string, number> = {}

  for (const opt of options) {
    if (!maxByQuestion[opt.question_key] || opt.score > maxByQuestion[opt.question_key]) {
      maxByQuestion[opt.question_key] = opt.score
    }
  }

  for (const opt of options) {
    const answer = answers[opt.question_key]
    if (answer === opt.option_key || (Array.isArray(answer) && (answer as string[]).includes(opt.option_key))) {
      if (!scoresByQuestion[opt.question_key] || opt.score > scoresByQuestion[opt.question_key]) {
        scoresByQuestion[opt.question_key] = opt.score
      }
    }
  }

  for (const [key, max] of Object.entries(maxByQuestion)) {
    maxPossible += max
    total += scoresByQuestion[key] ?? 0
  }

  return maxPossible > 0 ? Math.round((total / maxPossible) * 100) : 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { assessment_id }: EligibilityRequest = await req.json()

    if (!assessment_id) {
      return new Response(JSON.stringify({ error: 'assessment_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch assessment
    const { data: assessment, error: aErr } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessment_id)
      .single()

    if (aErr || !assessment) {
      return new Response(JSON.stringify({ error: 'Assessment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const answers = assessment.answers as Record<string, unknown>

    // Fetch all question options for scoring
    const { data: options } = await supabase
      .from('form_question_options')
      .select('question_id, option_key, score, form_questions!inner(question_key)')
      .eq('is_active', true)

    const flatOptions = (options ?? []).map((o: Record<string, unknown>) => ({
      question_key: (o.form_questions as { question_key: string }).question_key,
      option_key: o.option_key as string,
      score: o.score as number,
    }))

    // Calculate overall score
    const scoreNumeric = calculateScore(answers, flatOptions)
    const scoreCategory = scoreNumeric >= 65 ? 'alta' : scoreNumeric >= 35 ? 'media' : 'baixa'

    // Evaluate per visa type
    const { data: visaTypes } = await supabase
      .from('visa_types')
      .select('id, code, name_pt, rule_versions!inner(id, rules, is_active)')
      .eq('is_active', true)
      .eq('rule_versions.is_active', true)

    const suggestedVisaTypes = []

    for (const vt of visaTypes ?? []) {
      const ruleVersions = Array.isArray(vt.rule_versions) ? vt.rule_versions : [vt.rule_versions]
      const activeRule = ruleVersions[0]
      if (!activeRule) continue

      const eligible = evaluateRule(activeRule.rules, answers as Record<string, unknown>)

      suggestedVisaTypes.push({
        visa_type_id: vt.id,
        visa_type_code: vt.code,
        visa_type_name: vt.name_pt,
        eligible,
        rule_version_id: activeRule.id,
      })
    }

    // Sort: eligible first, then by visa score
    suggestedVisaTypes.sort((a, b) => (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0))

    // Upsert result
    const { data: result, error: rErr } = await supabase
      .from('assessment_results')
      .upsert({
        assessment_id,
        score_numeric: scoreNumeric,
        score_category: scoreCategory,
        suggested_visa_types: suggestedVisaTypes,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'assessment_id' })
      .select()
      .single()

    if (rErr) {
      console.error('Error upserting result:', rErr)
      throw rErr
    }

    // Mark assessment as completed
    await supabase
      .from('assessments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', assessment_id)

    return new Response(JSON.stringify({ result }), {
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
