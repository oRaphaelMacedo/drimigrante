/**
 * useChecklist — checklist de próximos passos por caminho, ligado ao upload (DI-049).
 *
 * Fonte dos itens: src/data/nationality-paths.ts (documentos e etapas de cada
 * caminho identificado no diagnóstico). Enquanto o dono não preencher a lista
 * confirmada de um caminho (campo PENDING), entra uma lista GENÉRICA E NEUTRA,
 * sem afirmar requisitos legais nem prazos:
 *  - documentos pessoais que qualquer pedido de nacionalidade usa para
 *    identificar a pessoa (documento de identificação e certidão de nascimento);
 *  - o documento que comprova a ligação que DEFINE o caminho (ex.: casamento →
 *    certidão de casamento; descendência → documentos do familiar português).
 * A tela avisa que a lista completa de cada caminho está na análise.
 *
 * Estado de cada documento:
 *  - 'sent'    → há arquivo enviado em `user_documents` com esse `document_type`
 *                (um arquivo devolvido pela equipe, `rejected`, não conta);
 *  - 'have'    → a pessoa marcou "Já tenho" (localStorage, por user.id);
 *  - 'pending' → nenhum dos dois.
 * Etapas (quando o caminho tiver `nextSteps` confirmados): 'pending' ou 'done'
 * (marcado pela pessoa, também no localStorage).
 *
 * A lista de arquivos usa a chave ['user-documents', userId]: o upload e a
 * remoção na DocumentsPage invalidam essa chave e a home acompanha.
 */
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getNationalityPath,
  getPathDocuments,
  getPathSteps,
  isNationalityPathCode,
  type NationalityPathCode,
  type PathDocument,
} from '@/data/nationality-paths'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult, type AssessmentResult } from '@/hooks/useAssessmentResult'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

// ── Arquivos enviados ────────────────────────────────────────────────────────

/** Status gravados em `user_documents.status` (só a equipe muda depois do envio). */
export type UserDocumentStatus = 'uploaded' | 'reviewing' | 'verified' | 'rejected'

export interface UserDocument {
  id: string
  document_type: string
  display_name: string
  file_name: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  status: string
  feedback: string | null
  created_at: string
}

/** Colunas explícitas (nunca `*`). */
export const USER_DOCUMENT_COLUMNS =
  'id, document_type, display_name, file_name, storage_path, file_size, mime_type, status, feedback, created_at'

export function userDocumentsQueryKey(userId: string | null | undefined) {
  return ['user-documents', userId ?? null] as const
}

/** Tipo usado para arquivos avulsos ("Outro documento"), fora do checklist. */
export const OTHER_DOCUMENT_TYPE = 'outro'

function newestFirst(docs: UserDocument[]): UserDocument[] {
  return [...docs].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

export async function fetchUserDocuments(userId: string): Promise<UserDocument[]> {
  // Ordenação no cliente: a lista é pequena e o select fica simples.
  const { data, error } = await supabase.from('user_documents').select(USER_DOCUMENT_COLUMNS).eq('user_id', userId)
  if (error) throw error
  return newestFirst((data ?? []) as UserDocument[])
}

// ── Lista genérica e neutra (enquanto o caminho não tiver lista confirmada) ──

/**
 * Documentos pessoais de identificação. As chaves reaproveitam as da lista
 * antiga da DocumentsPage, para os arquivos já enviados continuarem no lugar.
 */
export const GENERIC_BASE_DOCUMENTS: readonly PathDocument[] = [
  {
    key: 'passaporte',
    label: 'Passaporte ou documento de identificação',
    hint: 'Foto ou digitalização legível da página com os seus dados.',
  },
  {
    key: 'assento_nascimento',
    label: 'Sua certidão de nascimento',
    hint: 'Confira na sua análise se ela precisa de apostila ou tradução.',
  },
]

const FAMILY_DOCUMENTS: PathDocument = {
  key: 'documento_parentes',
  label: 'Documentos do familiar português',
  hint: 'Certidões que mostram a sua ligação com o familiar português.',
}

/** O documento da ligação que define cada caminho (sem requisitos além disso). */
export const GENERIC_LINK_DOCUMENTS: Readonly<Record<NationalityPathCode, readonly PathDocument[]>> = {
  nacionalidade_descendencia_1: [FAMILY_DOCUMENTS],
  nacionalidade_descendencia_2: [FAMILY_DOCUMENTS],
  pesquisa_genealogica: [
    {
      key: 'documento_parentes',
      label: 'Documentos da família que você já tem',
      hint: 'Certidões antigas, nomes, datas e locais ajudam a pesquisa.',
    },
  ],
  nacionalidade_ex_colonias: [
    {
      key: 'documento_parentes',
      label: 'Documentos da sua família',
      hint: 'Certidões que mostram a origem da sua família.',
    },
  ],
  nacionalidade_casamento: [
    {
      key: 'certidao_casamento',
      label: 'Certidão de casamento ou prova da união estável',
      hint: 'Com o seu cônjuge ou companheiro(a) português(a).',
    },
  ],
  naturalizacao_residencia: [
    {
      key: 'titulo_residencia',
      label: 'Título de residência em Portugal',
      hint: 'Autorização de residência ou outro documento da sua situação legal.',
    },
  ],
  reaquisicao_nacionalidade: [
    {
      key: 'documento_nacionalidade_anterior',
      label: 'Documento da nacionalidade portuguesa que você tinha',
      hint: 'Qualquer registro português da época, se você tiver.',
    },
  ],
  nacionalidade_nascimento: [],
  analise_personalizada: [],
}

// ── Marcações locais ("Já tenho" e etapas feitas) ────────────────────────────

export interface ChecklistMarks {
  /** Documentos marcados como "Já tenho". */
  have: string[]
  /** Etapas marcadas como feitas. */
  done: string[]
}

const EMPTY_MARKS: ChecklistMarks = { have: [], done: [] }
const MARKS_PREFIX = 'di_checklist_v1'
const MAX_MARKS = 100
const KEY_RE = /^[a-z0-9_]{1,64}$/

export function checklistStorageKey(userId: string): string {
  return `${MARKS_PREFIX}:${userId}`
}

function cleanKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && KEY_RE.test(v)))).slice(
    0,
    MAX_MARKS,
  )
}

/** Lê as marcações da conta neste navegador (nunca lança). */
export function readChecklistMarks(userId: string | null | undefined): ChecklistMarks {
  if (!userId) return EMPTY_MARKS
  try {
    const raw = window.localStorage.getItem(checklistStorageKey(userId))
    if (!raw) return EMPTY_MARKS
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY_MARKS
    const record = parsed as Record<string, unknown>
    return { have: cleanKeys(record.have), done: cleanKeys(record.done) }
  } catch {
    return EMPTY_MARKS
  }
}

/** Grava as marcações (sem storage: segue sem lembrar). */
export function writeChecklistMarks(userId: string, marks: ChecklistMarks): void {
  try {
    window.localStorage.setItem(
      checklistStorageKey(userId),
      JSON.stringify({ have: cleanKeys(marks.have), done: cleanKeys(marks.done) }),
    )
  } catch {
    // navegação privada / storage cheio
  }
}

// ── Checklist (função pura) ──────────────────────────────────────────────────

export type ChecklistDocumentState = 'pending' | 'have' | 'sent'
export type ChecklistStepState = 'pending' | 'done'

interface ChecklistItemBase {
  key: string
  label: string
  hint?: string
  /** Caminhos que pedem este item. */
  pathways: NationalityPathCode[]
}

export interface ChecklistDocumentItem extends ChecklistItemBase {
  kind: 'document'
  state: ChecklistDocumentState
  /** Arquivos enviados para este item (mais novo primeiro). */
  files: UserDocument[]
}

export interface ChecklistStepItem extends ChecklistItemBase {
  kind: 'step'
  state: ChecklistStepState
}

export type ChecklistItem = ChecklistDocumentItem | ChecklistStepItem

export interface Checklist {
  /** Caminhos considerados (códigos conhecidos, na ordem do diagnóstico). */
  pathwayCodes: NationalityPathCode[]
  /** 'generic' quando algum caminho (ou nenhum caminho) usa a lista neutra. */
  source: 'paths' | 'generic'
  steps: ChecklistStepItem[]
  documents: ChecklistDocumentItem[]
  /** Arquivos enviados que não pertencem a nenhum item (lista antiga ou "Outro documento"). */
  otherFiles: UserDocument[]
  /** Itens prontos: documentos "Já tenho"/enviados e etapas feitas. */
  completed: number
  total: number
  /** Primeiro item ainda pendente (etapas antes dos documentos), ou null. */
  next: ChecklistItem | null
  /** Total de arquivos enviados (inclui os avulsos). */
  uploadedCount: number
}

export interface BuildChecklistInput {
  pathwayCodes: readonly string[]
  documents: readonly UserDocument[]
  marks: ChecklistMarks
}

interface Def {
  key: string
  label: string
  hint?: string
  pathways: NationalityPathCode[]
}

function addDef(map: Map<string, Def>, item: { key: string; label: string; hint?: string }, code: NationalityPathCode | null) {
  const existing = map.get(item.key)
  if (existing) {
    if (code && !existing.pathways.includes(code)) existing.pathways.push(code)
    return
  }
  map.set(item.key, { key: item.key, label: item.label, hint: item.hint, pathways: code ? [code] : [] })
}

/** Códigos de caminho conhecidos, sem repetição. */
export function knownPathwayCodes(codes: readonly string[]): NationalityPathCode[] {
  return Array.from(new Set(codes.filter(isNationalityPathCode)))
}

export function buildChecklist({ pathwayCodes, documents, marks }: BuildChecklistInput): Checklist {
  const codes = knownPathwayCodes(pathwayCodes)
  const documentDefs = new Map<string, Def>()
  const stepDefs = new Map<string, Def>()
  let generic = codes.length === 0

  if (codes.length === 0) {
    for (const doc of GENERIC_BASE_DOCUMENTS) addDef(documentDefs, doc, null)
  }

  for (const code of codes) {
    const path = getNationalityPath(code)
    const confirmed = getPathDocuments(path)
    if (confirmed.length > 0) {
      for (const doc of confirmed) addDef(documentDefs, doc, code)
    } else {
      generic = true
      for (const doc of [...GENERIC_BASE_DOCUMENTS, ...GENERIC_LINK_DOCUMENTS[code]]) addDef(documentDefs, doc, code)
    }
    for (const step of getPathSteps(path)) addDef(stepDefs, { key: step.key, label: step.label, hint: step.detail }, code)
  }

  const filesByType = new Map<string, UserDocument[]>()
  for (const doc of newestFirst([...documents])) {
    const list = filesByType.get(doc.document_type) ?? []
    list.push(doc)
    filesByType.set(doc.document_type, list)
  }

  const have = new Set(marks.have)
  const done = new Set(marks.done)

  const documentItems: ChecklistDocumentItem[] = Array.from(documentDefs.values()).map((def) => {
    const files = filesByType.get(def.key) ?? []
    const sent = files.some((file) => file.status !== 'rejected')
    return {
      ...def,
      kind: 'document',
      files,
      state: sent ? 'sent' : have.has(def.key) ? 'have' : 'pending',
    }
  })

  const stepItems: ChecklistStepItem[] = Array.from(stepDefs.values()).map((def) => ({
    ...def,
    kind: 'step',
    state: done.has(def.key) ? 'done' : 'pending',
  }))

  const otherFiles = newestFirst(documents.filter((doc) => !documentDefs.has(doc.document_type)))
  const ordered: ChecklistItem[] = [...stepItems, ...documentItems]
  const completed = ordered.filter((item) => item.state !== 'pending').length

  return {
    pathwayCodes: codes,
    source: generic ? 'generic' : 'paths',
    steps: stepItems,
    documents: documentItems,
    otherFiles,
    completed,
    total: ordered.length,
    next: ordered.find((item) => item.state === 'pending') ?? null,
    uploadedCount: documents.length,
  }
}

/** Âncora (id) do item na página de Documentos: `doc-<chave>` ou `etapa-<chave>`. */
export function checklistItemAnchor(kind: ChecklistItem['kind'], key: string): string {
  return `${kind === 'document' ? 'doc' : 'etapa'}-${key}`
}

/** Códigos dos caminhos do diagnóstico (recalculados das respostas, quando houver). */
export function pathwayCodesFromResult(result: AssessmentResult | null | undefined): string[] {
  if (!result) return []
  const source = result.pathways && result.pathways.length > 0 ? result.pathways : result.localVisas ?? []
  return source.map((pathway) => pathway.code).filter((code): code is string => typeof code === 'string')
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseChecklistOptions {
  /** false: não consulta os arquivos (ex.: quem ainda não pagou). */
  enabled?: boolean
}

export interface UseChecklistReturn {
  checklist: Checklist
  /** Todos os arquivos enviados (mais novo primeiro). */
  documents: UserDocument[]
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
  /** Marca/desmarca "Já tenho" num documento. */
  setHave: (key: string, value: boolean) => void
  /** Marca/desmarca uma etapa como feita. */
  setStepDone: (key: string, value: boolean) => void
}

export function useChecklist({ enabled = true }: UseChecklistOptions = {}): UseChecklistReturn {
  const { authUser, hasAccess } = useAuth()
  const { result } = useAssessmentResult()
  const userId = authUser?.user.id ?? null
  const canRead = hasAccess('documents_read')
  const queryEnabled = enabled && !!userId && canRead

  const query = useQuery({
    queryKey: userDocumentsQueryKey(userId),
    queryFn: () => fetchUserDocuments(userId as string),
    enabled: queryEnabled,
    staleTime: 30_000,
  })

  // Marcações por conta: relidas se a conta mudar (ex.: troca de usuário no aparelho).
  const [store, setStore] = useState(() => ({ userId, marks: readChecklistMarks(userId) }))
  const marks = store.userId === userId ? store.marks : readChecklistMarks(userId)

  const codes = pathwayCodesFromResult(result)
  const codesKey = codes.join(',')
  const data = query.data
  const checklist = useMemo(
    () => buildChecklist({ pathwayCodes: codesKey ? codesKey.split(',') : [], documents: data ?? [], marks }),
    [codesKey, data, marks],
  )
  const primaryPathway = checklist.pathwayCodes[0] ?? 'generic'

  const updateMarks = useCallback(
    (field: keyof ChecklistMarks, key: string, value: boolean) => {
      if (!userId || !KEY_RE.test(key)) return
      setStore((current) => {
        const base = current.userId === userId ? current.marks : readChecklistMarks(userId)
        const set = new Set(base[field])
        if (value) set.add(key)
        else set.delete(key)
        const next: ChecklistMarks = { ...base, [field]: Array.from(set) }
        writeChecklistMarks(userId, next)
        return { userId, marks: next }
      })
      track('checklist_item_checked', {
        item_key: key,
        state: value ? (field === 'have' ? 'have' : 'done') : 'pending',
        pathway: primaryPathway,
      })
    },
    [userId, primaryPathway],
  )

  const setHave = useCallback((key: string, value: boolean) => updateMarks('have', key, value), [updateMarks])
  const setStepDone = useCallback((key: string, value: boolean) => updateMarks('done', key, value), [updateMarks])

  return {
    checklist,
    documents: data ?? [],
    isLoading: queryEnabled && query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    setHave,
    setStepDone,
  }
}
