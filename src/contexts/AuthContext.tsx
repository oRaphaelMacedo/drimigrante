/**
 * AuthContext — estado de autenticação único para todo o app.
 *
 * Histórico:
 *  B04-A01 — Provider único, sem estado por componente
 *  B04-A03 — onAuthStateChange(INITIAL_SESSION) no lugar de getSession()
 *  B04-A04 — queryClient.clear() no SIGNED_OUT
 *  B04-A05 — isHubUser (super_admin | hub_admin) separado de isStaffUser (+ lawyer | paralegal)
 *  B02-A21 — vincula o assessment anônimo do localStorage no SIGNED_IN
 *
 * DI-025 (2026-10):
 *  - Perfil/assinatura/papéis com timeout, retry e backoff (src/lib/auth-user-data.ts).
 *    Falha NÃO vira "sem assinatura": expõe `userDataError` e o ProtectedRoute
 *    mostra uma tela de erro com "Tentar de novo" em vez de tratar o pagante
 *    como não pagante.
 *  - `refreshUser()` recarrega os dados (ex.: depois do pagamento). Também há
 *    refresh em segundo plano quando a aba volta a ficar visível (o supabase-js
 *    emite SIGNED_IN nesse momento) e quando a conexão volta.
 *  - Regras de acesso em src/lib/access.ts (`access` e `hasAccess`). O estado
 *    acompanha o relógio com a aba aberta: é recalculado no instante em que o
 *    prazo muda de fase (nextAccessChangeAt) e ao voltar para a aba.
 *  - identify()/resetAnalytics() no login/logout; Sentry via '@/lib/sentry'.
 *    Sem consentimento de cookies, identify() não envia nada: o usuário só é
 *    marcado como identificado com consentimento, e é identificado quando a
 *    pessoa aceita os cookies na mesma sessão (evento `consent-changed`).
 *  - Só vincula o assessment anônimo se o e-mail do quiz for o da conta.
 * DI-027: `signInWithMagicLink(email, next)` leva o destino na URL do callback.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { Sentry } from '@/lib/sentry'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/query-client'
import { getConsent, identify, resetAnalytics } from '@/lib/analytics'
import { linkAnonAssessmentToUser } from '@/hooks/useAssessment'
import {
  getAccessState,
  hasFeatureAccess,
  nextAccessChangeAt,
  type AccessFeature,
  type AccessState,
} from '@/lib/access'
import {
  isSameSnapshot,
  loadUserDataWithRetry,
  type UserDataQueries,
} from '@/lib/auth-user-data'
import { buildAuthCallbackUrl } from '@/lib/auth-redirect'
import { getLinkableAssessment, readStoredQuizIdentity } from '@/lib/stored-quiz-result'
import type { Profile, Subscription, AppRole } from '@/lib/database.types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  user: User
  profile: Profile | null
  subscription: Subscription | null
  roles: AppRole[]
}

export interface UseAuthReturn {
  authUser: AuthUser | null
  session: Session | null
  /** true até sabermos se há sessão e, havendo, até os dados da conta carregarem. */
  loading: boolean
  /**
   * Erro ao carregar perfil/assinatura/papéis depois de todas as tentativas.
   * Quando não é null, `authUser.subscription` e `authUser.roles` NÃO são
   * confiáveis: não trate a pessoa como "sem assinatura" (risco de cobrança
   * dupla). Mostre um aviso com `refreshUser()`.
   */
  userDataError: Error | null
  /**
   * Recarrega perfil, assinatura e papéis (ex.: polling depois do pagamento).
   * Resolve com os dados novos, ou `null` se não há sessão ou se falhou
   * (nesse caso os últimos dados confiáveis são mantidos).
   */
  refreshUser: () => Promise<AuthUser | null>
  /** Estado de acesso calculado por getAccessState (src/lib/access.ts). */
  access: AccessState
  /** Envia o link de acesso. `next` = caminho interno para onde voltar (validado). */
  signInWithMagicLink: (email: string, next?: string | null) => Promise<{ error: Error | null }>
  /** Entra com o código numérico do e-mail (requer {{ .Token }} no template do Supabase). */
  verifyEmailCode: (email: string, code: string) => Promise<{ error: Error | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithGoogle: (next?: string | null) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  /** Full admin access: super_admin | hub_admin */
  isHubUser: boolean
  /** Cases/leads access: hub + lawyer | paralegal */
  isStaffUser: boolean
  /** Atalho para hasFeatureAccess(authUser.subscription, feature, { isStaff }). */
  hasAccess: (feature: AccessFeature) => boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HUB_ROLES: AppRole[] = ['super_admin', 'hub_admin']
/** Evento disparado em window pelo analytics/consent ao mudar a escolha de cookies. */
const CONSENT_CHANGED_EVENT = 'consent-changed'
/** Maior atraso aceito por setTimeout (~24,8 dias); acima disso ele dispara na hora. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1
const STAFF_ROLES: AppRole[] = ['super_admin', 'hub_admin', 'lawyer', 'paralegal']

// `.retry(false)`: o postgrest-js já repete GETs sozinho (1s, 2s, 4s), o que
// somado ao nosso retry deixaria a pessoa olhando um spinner por muito tempo.
// O retry/backoff/timeout fica todo em loadUserDataWithRetry.
function createUserDataQueries(userId: string): UserDataQueries {
  return {
    profile: (signal) =>
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .abortSignal(signal)
        .maybeSingle()
        .retry(false),
    subscription: (signal) =>
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .abortSignal(signal)
        .maybeSingle()
        .retry(false),
    roles: (signal) =>
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .abortSignal(signal)
        .retry(false),
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

// ── Internal hook (not exported — used only by AuthProvider) ──────────────────

function useAuthInternal(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [userDataError, setUserDataError] = useState<Error | null>(null)

  const mountedRef = useRef(true)
  const sessionRef = useRef<Session | null>(null)
  const authUserRef = useRef<AuthUser | null>(null)
  /** Usuário da sessão atual (descarta respostas que chegam depois de logout/troca). */
  const currentUserIdRef = useRef<string | null>(null)
  /** Usuário cujos dados já carregaram com sucesso ao menos uma vez. */
  const loadedUserIdRef = useRef<string | null>(null)
  const inflightRef = useRef<{ userId: string; promise: Promise<AuthUser | null> } | null>(null)
  const linkedKeyRef = useRef<string | null>(null)
  const identifiedUserIdRef = useRef<string | null>(null)

  const commitAuthUser = useCallback((next: AuthUser | null) => {
    authUserRef.current = next
    setAuthUser(next)
  }, [])

  const loadUserData = useCallback(
    (user: User): Promise<AuthUser | null> => {
      const inflight = inflightRef.current
      if (inflight && inflight.userId === user.id) return inflight.promise

      const promise = (async (): Promise<AuthUser | null> => {
        try {
          const snapshot = await loadUserDataWithRetry(createUserDataQueries(user.id), {
            onAttemptError: (error, attempt) => {
              Sentry.addBreadcrumb({
                category: 'auth',
                level: 'warning',
                message: `loadUserData: tentativa ${attempt} falhou`,
                data: { reason: toError(error).message },
              })
            },
            onProfileError: (error) => {
              Sentry.captureException(error, { tags: { ctx: 'auth.profile' } })
            },
          })
          if (!mountedRef.current || currentUserIdRef.current !== user.id) return null

          const prev = authUserRef.current
          // Mesmo conteúdo: mantém a referência (evita re-render e reset de formulários).
          const unchanged =
            prev !== null &&
            prev.user.id === user.id &&
            isSameSnapshot(
              { profile: prev.profile, subscription: prev.subscription, roles: prev.roles },
              snapshot,
            )
          const next: AuthUser = unchanged && prev ? prev : { user, ...snapshot }
          loadedUserIdRef.current = user.id
          if (next !== prev) commitAuthUser(next)
          setUserDataError(null)
          return next
        } catch (error) {
          Sentry.captureException(error, { tags: { ctx: 'auth.loadUserData' } })
          if (!mountedRef.current || currentUserIdRef.current !== user.id) return null
          if (loadedUserIdRef.current === user.id) {
            // Falha num refresh em segundo plano: mantém os últimos dados confiáveis.
            return null
          }
          commitAuthUser({ user, profile: null, subscription: null, roles: [] })
          setUserDataError(toError(error))
          return null
        } finally {
          if (inflightRef.current?.userId === user.id) inflightRef.current = null
        }
      })()

      inflightRef.current = { userId: user.id, promise }
      return promise
    },
    [commitAuthUser],
  )

  // B02-A21 + diretriz W1-06: vincula o assessment anônimo deste navegador só
  // quando o e-mail do quiz é o mesmo da conta. Best-effort, não bloqueia.
  const linkStoredAnonAssessment = useCallback((user: User) => {
    const candidate = getLinkableAssessment(readStoredQuizIdentity(), user.email)
    if (!candidate) return
    const key = `${user.id}:${candidate.assessmentId}`
    if (linkedKeyRef.current === key) return
    linkedKeyRef.current = key

    linkAnonAssessmentToUser(candidate.assessmentId, candidate.sessionId)
      .then(({ error }) => {
        if (!error) return
        linkedKeyRef.current = null
        Sentry.captureMessage('linkAnonAssessment failed', {
          level: 'warning',
          tags: { ctx: 'auth.link' },
          extra: { error },
        })
      })
      .catch((error: unknown) => {
        linkedKeyRef.current = null
        Sentry.captureException(error, { tags: { ctx: 'auth.link' } })
      })
  }, [])

  const identifyOnce = useCallback((userId: string) => {
    if (identifiedUserIdRef.current === userId) return
    // Sem consentimento identify() não envia nada: não marca, para identificar
    // quando a pessoa aceitar os cookies (listener de consent-changed abaixo).
    if (getConsent() !== 'granted') return
    identifiedUserIdRef.current = userId
    identify(userId)
  }, [])

  useEffect(() => {
    const onConsentChanged = () => {
      if (getConsent() !== 'granted') {
        identifiedUserIdRef.current = null
        return
      }
      const userId = currentUserIdRef.current
      if (userId) identifyOnce(userId)
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChanged)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChanged)
  }, [identifyOnce])

  useEffect(() => {
    mountedRef.current = true

    // B04-A03: INITIAL_SESSION substitui getSession(). As chamadas ao banco são
    // adiadas com setTimeout porque um await dentro do callback trava o cliente
    // de auth (deadlock nos eventos seguintes).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mountedRef.current) return
      sessionRef.current = nextSession
      setSession(nextSession)
      const user = nextSession?.user ?? null

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (!user) {
          if (event === 'INITIAL_SESSION') {
            currentUserIdRef.current = null
            setLoading(false)
          }
          return
        }

        const isNewUser = currentUserIdRef.current !== user.id
        currentUserIdRef.current = user.id
        if (isNewUser) {
          // Primeiro login ou troca de conta: rotas protegidas esperam os dados.
          loadedUserIdRef.current = null
          if (authUserRef.current && authUserRef.current.user.id !== user.id) commitAuthUser(null)
          setUserDataError(null)
          setLoading(true)
        }
        // Mesmo usuário (ex.: SIGNED_IN ao voltar para a aba): refresh em segundo plano.

        setTimeout(() => {
          if (!mountedRef.current || currentUserIdRef.current !== user.id) return
          if (event === 'SIGNED_IN') linkStoredAnonAssessment(user)
          identifyOnce(user.id)
          void loadUserData(user).finally(() => {
            if (mountedRef.current && currentUserIdRef.current === user.id) setLoading(false)
          })
        }, 0)
        return
      }

      if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null
        loadedUserIdRef.current = null
        inflightRef.current = null
        linkedKeyRef.current = null
        identifiedUserIdRef.current = null
        // B04-A04: limpa o cache do TanStack Query (evita vazar dados entre sessões)
        queryClient.clear()
        commitAuthUser(null)
        setUserDataError(null)
        setLoading(false)
        resetAnalytics()
        return
      }

      if (event === 'USER_UPDATED' && user) {
        const prev = authUserRef.current
        if (prev && prev.user.id === user.id) commitAuthUser({ ...prev, user })
      }
      // TOKEN_REFRESHED e demais eventos: só a sessão muda (já atualizada acima).
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [commitAuthUser, identifyOnce, linkStoredAnonAssessment, loadUserData])

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    const user = sessionRef.current?.user
    if (!user) return null
    return loadUserData(user)
  }, [loadUserData])

  // Sem dados confiáveis: tenta de novo sozinho quando a conexão volta.
  useEffect(() => {
    if (!userDataError) return
    const onOnline = () => {
      void refreshUser()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [userDataError, refreshUser])

  const signInWithMagicLink = useCallback(async (email: string, next?: string | null) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: buildAuthCallbackUrl(next) },
    })
    return { error: error as Error | null }
  }, [])

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    return { error: error as Error | null }
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }, [])

  const signInWithGoogle = useCallback(async (next?: string | null) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: buildAuthCallbackUrl(next) },
    })
    return { error: error as Error | null }
  }, [])

  const signOut = useCallback(async () => {
    // O handler de SIGNED_OUT acima limpa cache, estado e analytics.
    await supabase.auth.signOut()
  }, [])

  // B04-A05: hub = admin completo; staff = acesso a casos/leads
  const isHubUser = authUser?.roles.some((r) => HUB_ROLES.includes(r)) ?? false
  const isStaffUser = authUser?.roles.some((r) => STAFF_ROLES.includes(r)) ?? false

  const subscription = authUser?.subscription ?? null

  // O prazo do €30 muda de fase com a aba aberta (dias restantes, 'expiring',
  // 'expired'): `accessTick` avança nesse instante e força o recálculo.
  const [accessTick, setAccessTick] = useState(0)
  useEffect(() => {
    const changeAt = nextAccessChangeAt(subscription, { isStaff: isStaffUser })
    if (!changeAt) return
    const bump = () => setAccessTick((n) => n + 1)
    const delay = Math.min(Math.max(changeAt.getTime() - Date.now(), 0), MAX_TIMER_DELAY_MS)
    const timer = window.setTimeout(bump, delay)
    // Com a tela apagada o celular congela timers: confere ao voltar para a aba.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() >= changeAt.getTime()) bump()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [subscription, isStaffUser, accessTick])

  const access = useMemo(() => {
    void accessTick // dependência de propósito: recalcula com o relógio atual
    return getAccessState(subscription, { isStaff: isStaffUser })
  }, [subscription, isStaffUser, accessTick])

  const hasAccess = useCallback(
    (feature: AccessFeature) => hasFeatureAccess(subscription, feature, { isStaff: isStaffUser }),
    [subscription, isStaffUser],
  )

  return useMemo(
    () => ({
      authUser,
      session,
      loading,
      userDataError,
      refreshUser,
      access,
      signInWithMagicLink,
      verifyEmailCode,
      signInWithPassword,
      signInWithGoogle,
      signOut,
      isHubUser,
      isStaffUser,
      hasAccess,
    }),
    [
      authUser,
      session,
      loading,
      userDataError,
      refreshUser,
      access,
      signInWithMagicLink,
      verifyEmailCode,
      signInWithPassword,
      signInWithGoogle,
      signOut,
      isHubUser,
      isStaffUser,
      hasAccess,
    ],
  )
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<UseAuthReturn | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthInternal()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
