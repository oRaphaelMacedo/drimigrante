import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ authUser: null }) }))

import {
  buildAssessmentResult,
  normalizeAnswers,
  parseLocalQuizResult,
  pathwaysFromAnswers,
  resolveScore,
  type AssessmentResult,
  type AssessmentRow,
} from './useAssessmentResult'
import { computeScore } from '@/data/quiz-questions'

const ANSWERS = { processo_tipo: 'nacionalidade', caso_tipo: 'D', d1_situacao_legal: 'sim', d2_tempo_autorizacao: 'mais_5' }

describe('normalizeAnswers', () => {
  it('aceita só objetos e converte valores para texto', () => {
    expect(normalizeAnswers(null)).toBeNull()
    expect(normalizeAnswers([])).toBeNull()
    expect(normalizeAnswers({})).toBeNull()
    expect(normalizeAnswers({ a: 'x', b: 2, c: true, d: ['A', 'B', 3], e: null })).toEqual({
      a: 'x',
      b: '2',
      c: 'true',
      d: 'A,B',
    })
  })
})

describe('pathwaysFromAnswers', () => {
  it('reproduz suggestVisas (mesmos códigos e reasons)', () => {
    expect(pathwaysFromAnswers(ANSWERS)).toEqual([
      expect.objectContaining({ code: 'naturalizacao_residencia', match: 'strong', reason: expect.any(String) }),
    ])
    expect(pathwaysFromAnswers(null)).toEqual([])
  })

  it('ignora respostas de ramos ocultos', () => {
    // b1 só aparece com o caso B marcado.
    const withHidden = { ...ANSWERS, b1_tempo_casamento: 'mais_3_anos' }
    expect(pathwaysFromAnswers(withHidden).map((p) => p.code)).toEqual(['naturalizacao_residencia'])
  })
})

describe('resolveScore', () => {
  const computed = computeScore(ANSWERS)

  it('usa o score do banco quando é positivo', () => {
    expect(resolveScore({ dbScore: 72.4, dbCategory: 'alta', answers: ANSWERS, local: null })).toEqual({ percentage: 72, category: 'alta' })
  })

  it('ignora score 0 do banco quando há respostas (DI-007)', () => {
    expect(resolveScore({ dbScore: 0, dbCategory: 'baixa', answers: ANSWERS, local: null })).toEqual({
      percentage: computed.percentage,
      category: computed.category,
    })
  })

  it('localStorage do mesmo assessment vem antes do recálculo', () => {
    expect(resolveScore({ dbScore: 0, dbCategory: 'baixa', answers: ANSWERS, local: { percentage: 64.6, category: 'media' } })).toEqual({
      percentage: 65,
      category: 'media',
    })
  })

  it('aceita score numérico vindo como texto (DECIMAL do PostgREST)', () => {
    expect(resolveScore({ dbScore: '81.50', dbCategory: 'alta', answers: null, local: null })).toEqual({ percentage: 82, category: 'alta' })
  })

  it('sem banco nem respostas usa o localStorage', () => {
    expect(resolveScore({ dbScore: null, dbCategory: null, answers: null, local: { percentage: 55, category: 'media' } })).toEqual({
      percentage: 55,
      category: 'media',
    })
  })

  it('sem nada, mantém o 0 do banco ou cai para baixa', () => {
    expect(resolveScore({ dbScore: 0, dbCategory: 'baixa', answers: null, local: null })).toEqual({ percentage: 0, category: 'baixa' })
    expect(resolveScore({ dbScore: undefined, dbCategory: undefined, answers: null, local: null })).toEqual({ percentage: 0, category: 'baixa' })
  })
})

// ── buildAssessmentResult ───────────────────────────────────────────────────

const AID = '00000000-0000-4000-8000-0000000000aa'
const DESC_ANSWERS = { processo_tipo: 'nacionalidade', caso_tipo: 'A', a1_antepassado: 'pai_mae', a2_documento: 'sim' }

function row(overrides: Partial<AssessmentRow> = {}): AssessmentRow {
  return {
    id: AID,
    full_name: 'Ana Souza',
    email: 'ana@example.com',
    completed_at: '2026-10-01T10:00:00.000Z',
    answers: DESC_ANSWERS,
    assessment_results: {
      assessment_id: AID,
      score_numeric: 0,
      score_category: 'baixa',
      suggested_visa_types: [],
      ia_explanation_short: null,
      computed_at: null,
    },
    ...overrides,
  }
}

const NO_LOCAL = parseLocalQuizResult(null)

describe('buildAssessmentResult', () => {
  it('sem localStorage, recalcula as vias e o score a partir das respostas do banco (DI-007)', () => {
    const result = buildAssessmentResult(row(), NO_LOCAL)
    expect(result?.pathways.map((p) => p.code)).toEqual(['nacionalidade_descendencia_1'])
    expect(result?.pathways[0].reason).toMatch(/antepassado português/)
    expect(result?.pathwaysSource).toBe('answers')
    expect(result?.localVisas).toEqual(result?.pathways)
    expect(result?.scorePercentage).toBe(computeScore(DESC_ANSWERS).percentage)
    expect(result?.scorePercentage).toBeGreaterThan(0)
  })

  it('mesmas vias com ou sem o localStorage do aparelho original', () => {
    const local = parseLocalQuizResult(
      JSON.stringify({
        assessmentId: AID,
        answers: DESC_ANSWERS,
        visas: [{ code: 'D7', name: 'Visto D7', match: 'strong' }],
        score: { percentage: 70, category: 'alta' },
      }),
    )
    const withLocal = buildAssessmentResult(row(), local)
    const withoutLocal = buildAssessmentResult(row(), NO_LOCAL)
    expect(withLocal?.pathways).toEqual(withoutLocal?.pathways)
    // O score do aparelho original vale enquanto o do banco for 0.
    expect(withLocal?.scorePercentage).toBe(70)
  })

  it('localStorage de OUTRO assessment não se mistura com o do banco', () => {
    const other = parseLocalQuizResult(
      JSON.stringify({
        assessmentId: '00000000-0000-4000-8000-0000000000bb',
        answers: { processo_tipo: 'nacionalidade', caso_tipo: 'E' },
        score: { percentage: 99, category: 'alta' },
        leadInfo: { fullName: 'Outra Pessoa', email: 'outra@example.com' },
      }),
    )
    const result = buildAssessmentResult(row(), other)
    expect(result?.assessmentId).toBe(AID)
    expect(result?.pathways.map((p) => p.code)).toEqual(['nacionalidade_descendencia_1'])
    expect(result?.scorePercentage).not.toBe(99)
    expect(result?.leadName).toBe('Ana Souza')
  })

  it('banco indisponível: usa o localStorage deste navegador', () => {
    const local = parseLocalQuizResult(
      JSON.stringify({ assessmentId: AID, answers: DESC_ANSWERS, score: { percentage: 70, category: 'alta' } }),
    )
    const result = buildAssessmentResult(null, local)
    expect(result?.assessmentId).toBe(AID)
    expect(result?.pathways.map((p) => p.code)).toEqual(['nacionalidade_descendencia_1'])
    expect(result?.scoreCategory).toBe('alta')
  })

  it('sem respostas, usa as vias salvas no localStorage', () => {
    const local = parseLocalQuizResult(
      JSON.stringify({
        assessmentId: AID,
        visas: [{ code: 'naturalizacao_residencia', name: 'Naturalização por Residência', match: 'possible', reason: 'Motivo.' }],
        score: { percentage: 50, category: 'media' },
      }),
    )
    const result = buildAssessmentResult(row({ answers: null }), local)
    expect(result?.pathwaysSource).toBe('local')
    expect(result?.pathways).toEqual([
      { code: 'naturalizacao_residencia', name: 'Naturalização por Residência', match: 'possible', reason: 'Motivo.' },
    ])
  })

  it('nada no banco nem no navegador → null', () => {
    expect(buildAssessmentResult(null, NO_LOCAL)).toBeNull()
  })

  it('analysisReady vem do resumo (gravado junto com a análise completa) e o texto pago nunca vem', () => {
    const pending = buildAssessmentResult(row(), NO_LOCAL)
    expect(pending?.analysisReady).toBe(false)
    const ready = buildAssessmentResult(
      row({
        assessment_results: {
          assessment_id: AID,
          score_numeric: 80,
          score_category: 'alta',
          suggested_visa_types: [],
          ia_explanation_short: 'Resumo pronto.',
          computed_at: null,
        },
      }),
      NO_LOCAL,
    )
    expect(ready?.analysisReady).toBe(true)
    expect(ready?.iaExplanationFull).toBeNull()
    expect(ready?.scorePercentage).toBe(80)
  })

  it('aceita o embed como lista e ignora suggested_visa_types que não é lista', () => {
    const result = buildAssessmentResult(
      row({
        assessment_results: [
          { assessment_id: AID, score_numeric: 75, score_category: 'alta', suggested_visa_types: {}, ia_explanation_short: null, computed_at: null },
        ],
      }),
      NO_LOCAL,
    )
    expect(result?.scorePercentage).toBe(75)
    expect(result?.suggestedVisaTypes).toEqual([])
  })

  it('o resultado continua compatível com o tipo AssessmentResult usado por outras telas', () => {
    const result: AssessmentResult | null = buildAssessmentResult(row(), NO_LOCAL)
    expect(result).not.toBeNull()
  })
})

describe('parseLocalQuizResult', () => {
  it('JSON inválido ou com tipos errados não quebra', () => {
    expect(parseLocalQuizResult('{oops')).toEqual(NO_LOCAL)
    expect(parseLocalQuizResult('[]')).toEqual(NO_LOCAL)
    const parsed = parseLocalQuizResult(
      JSON.stringify({ assessmentId: 42, score: { percentage: 'x' }, visas: [null, { code: 1 }], leadInfo: 'x' }),
    )
    expect(parsed.assessmentId).toBeNull()
    expect(parsed.score).toBeNull()
    expect(parsed.visas).toEqual([])
    expect(parsed.leadInfo).toBeNull()
  })

  it('match desconhecido vira weak', () => {
    const parsed = parseLocalQuizResult(JSON.stringify({ visas: [{ code: 'x', name: 'X', match: 'alta' }] }))
    expect(parsed.visas).toEqual([{ code: 'x', name: 'X', match: 'weak', reason: undefined }])
  })
})
