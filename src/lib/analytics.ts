import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://app.posthog.com'
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined

type ConsentState = 'granted' | 'denied' | 'pending'
const CONSENT_KEY = 'di_cookie_consent'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

export function getConsent(): ConsentState {
  if (typeof window === 'undefined') return 'pending'
  const v = localStorage.getItem(CONSENT_KEY)
  if (v === 'granted' || v === 'denied') return v
  return 'pending'
}

export function setConsent(state: 'granted' | 'denied') {
  localStorage.setItem(CONSENT_KEY, state)
  if (state === 'granted') {
    enableAnalytics()
  } else {
    disableAnalytics()
  }
  window.dispatchEvent(new CustomEvent('consent-changed', { detail: state }))
}

let initialized = false

export function initAnalytics() {
  const consent = getConsent()
  if (consent === 'granted') enableAnalytics()
}

function enableAnalytics() {
  if (initialized) {
    posthog.opt_in_capturing()
    return
  }
  initialized = true

  if (POSTHOG_KEY) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      person_profiles: 'identified_only',
      loaded: (ph) => {
        if (import.meta.env.DEV) ph.debug(false)
      },
    })
  }

  if (GA_ID && typeof window !== 'undefined') {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
    document.head.appendChild(script)
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args)
    }
    window.gtag('js', new Date())
    window.gtag('config', GA_ID, { anonymize_ip: true })
  }
}

function disableAnalytics() {
  if (POSTHOG_KEY && initialized) {
    posthog.opt_out_capturing()
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  if (getConsent() !== 'granted') return
  if (POSTHOG_KEY && initialized) posthog.capture(event, props)
  if (GA_ID && typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, props ?? {})
  }
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  if (getConsent() !== 'granted') return
  if (POSTHOG_KEY && initialized) posthog.identify(userId, traits)
  if (GA_ID && typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', GA_ID, { user_id: userId })
  }
}

export function resetAnalytics() {
  if (POSTHOG_KEY && initialized) posthog.reset()
}
