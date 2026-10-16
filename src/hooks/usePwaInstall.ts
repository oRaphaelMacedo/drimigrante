/**
 * usePwaInstall — convite para instalar o app (PWA) no dashboard (DI-078).
 *
 * - Android/Chrome (e desktop compatível): captura o `beforeinstallprompt`,
 *   impede a mini-barra automática do navegador e dispara o prompt nativo só
 *   quando a pessoa toca em "Instalar app".
 * - iOS: não há prompt nativo; o convite mostra as instruções do Safari
 *   ("Compartilhar" → "Adicionar à Tela de Início"). SÓ quando o login por
 *   código está ligado (VITE_AUTH_EMAIL_CODE=true): sem ele, o link mágico
 *   abre no Safari e o app instalado ficaria sem sessão.
 * - Nunca aparece com o app já instalado (display-mode standalone), em
 *   navegadores embutidos (Instagram, Facebook, TikTok) nem depois de
 *   dispensado (a dispensa vale por 30 dias neste aparelho).
 *
 * Quem decide ONDE o convite aparece é a página: só o dashboard pós-compra
 * (nunca /, /quiz ou /results).
 *
 * O `beforeinstallprompt` dispara uma vez por carregamento de página. O
 * listener é registrado quando este módulo é importado (chunk do dashboard);
 * se o evento chegar antes, o convite simplesmente não aparece nessa visita.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { track } from '@/lib/analytics'
import { isInAppBrowser } from '@/lib/in-app-browser'

/** Evento não padronizado do Chromium (não existe nos tipos do DOM). */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
  prompt: () => Promise<void>
}

export type PwaPlatform = 'android' | 'ios' | 'desktop'
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/** Por quanto tempo a dispensa do convite vale. */
export const PWA_DISMISS_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const PWA_DISMISS_KEY = 'di_pwa_install_v1:dismissed_at'

const IOS_CODE_LOGIN = import.meta.env.VITE_AUTH_EMAIL_CODE === 'true'

// ── Captura do evento (estado do módulo) ─────────────────────────────────────

interface InstallSnapshot {
  deferred: BeforeInstallPromptEvent | null
  installed: boolean
}

let snapshot: InstallSnapshot = { deferred: null, installed: false }
const listeners = new Set<() => void>()
let captureTarget: Window | null = null

function setSnapshot(next: InstallSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

function onBeforeInstallPrompt(event: Event) {
  // Sem preventDefault o Chrome mostra a própria mini-barra fora de contexto.
  event.preventDefault()
  setSnapshot({ ...snapshot, deferred: event as BeforeInstallPromptEvent })
}

function onAppInstalled() {
  setSnapshot({ deferred: null, installed: true })
}

/** Registra os listeners (idempotente). Chamado ao importar este módulo. */
export function capturePwaInstallPrompt(target: Window | undefined = typeof window === 'undefined' ? undefined : window) {
  if (!target || captureTarget === target) return
  captureTarget = target
  target.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  target.addEventListener('appinstalled', onAppInstalled)
}

/** Só para testes: volta ao estado inicial. */
export function resetPwaInstallStateForTests() {
  setSnapshot({ deferred: null, installed: false })
}

capturePwaInstallPrompt()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => snapshot

// ── Detecção ─────────────────────────────────────────────────────────────────

export function detectPwaPlatform(userAgent: string, maxTouchPoints = 0): PwaPlatform {
  // iPadOS se apresenta como Mac; o toque denuncia.
  if (/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'desktop'
}

function readEnvironment(): { platform: PwaPlatform; standalone: boolean; inApp: boolean } {
  if (typeof window === 'undefined') return { platform: 'desktop', standalone: false, inApp: false }
  const ua = window.navigator.userAgent || ''
  let standalone = false
  try {
    standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    standalone = false
  }
  return {
    platform: detectPwaPlatform(ua, window.navigator.maxTouchPoints ?? 0),
    standalone,
    inApp: isInAppBrowser(ua),
  }
}

export function isPwaInviteDismissed(now: number = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(PWA_DISMISS_KEY)
    if (!raw) return false
    const at = Date.parse(raw)
    if (Number.isNaN(at)) return false
    return now - at < PWA_DISMISS_DAYS * DAY_MS
  } catch {
    return false
  }
}

function saveDismissal(now: number = Date.now()) {
  try {
    window.localStorage.setItem(PWA_DISMISS_KEY, new Date(now).toISOString())
  } catch {
    // sem storage: o convite pode voltar na próxima visita
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePwaInstallOptions {
  /** Login por código ligado (padrão: VITE_AUTH_EMAIL_CODE). Condição para convidar no iOS. */
  iosCodeLogin?: boolean
}

export interface PwaInstall {
  platform: PwaPlatform
  /** O app já está aberto como instalado. */
  isStandalone: boolean
  /** Há prompt nativo disponível (Android/Chrome). */
  canPromptNative: boolean
  /** iOS com login por código: mostrar as instruções do Safari. */
  canShowIosInstructions: boolean
  /** O convite pode aparecer agora. */
  eligible: boolean
  /** Abre o prompt nativo e devolve a escolha da pessoa. */
  promptInstall: () => Promise<PwaInstallOutcome>
  /** "Agora não": esconde o convite por 30 dias neste aparelho. */
  dismiss: () => void
}

export function usePwaInstall({ iosCodeLogin = IOS_CODE_LOGIN }: UsePwaInstallOptions = {}): PwaInstall {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [env] = useState(readEnvironment)
  const [dismissed, setDismissed] = useState(() => isPwaInviteDismissed())

  // Instalou por outro caminho (menu do navegador): o convite some.
  useEffect(() => {
    if (state.installed) setDismissed(true)
  }, [state.installed])

  const canPromptNative = !!state.deferred
  const canShowIosInstructions = env.platform === 'ios' && iosCodeLogin
  const eligible =
    !env.standalone && !env.inApp && !state.installed && !dismissed && (canPromptNative || canShowIosInstructions)

  const dismiss = useCallback(() => {
    saveDismissal()
    setDismissed(true)
    track('pwa_install_dismissed', { platform: env.platform })
  }, [env.platform])

  const promptInstall = useCallback(async (): Promise<PwaInstallOutcome> => {
    const event = snapshot.deferred
    if (!event) return 'unavailable'
    track('pwa_install_clicked', { platform: env.platform })
    // O mesmo evento não pode ser usado duas vezes.
    setSnapshot({ ...snapshot, deferred: null })
    try {
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === 'accepted') {
        track('pwa_install_accepted', { platform: env.platform })
        setDismissed(true)
        return 'accepted'
      }
      track('pwa_install_dismissed', { platform: env.platform })
      saveDismissal()
      setDismissed(true)
      return 'dismissed'
    } catch {
      return 'unavailable'
    }
  }, [env.platform])

  return {
    platform: env.platform,
    isStandalone: env.standalone,
    canPromptNative,
    canShowIosInstructions,
    eligible,
    promptInstall,
    dismiss,
  }
}
