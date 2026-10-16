// Tipos de scripts/lib/test-target-guard.mjs (usado pelo Playwright e pelos fixtures E2E).

export declare const PRODUCTION_SUPABASE_REF: string
export declare const PRODUCTION_APP_HOSTS: readonly string[]
export declare const LOCAL_SUPABASE_URL: string

export interface TestTarget {
  supabaseUrl?: string
  baseUrl?: string
  loginUrl?: string
  /** Hosts de staging permitidos (lista ou texto separado por vírgula). */
  allowedRemoteHosts?: readonly string[] | string
}

export type UrlAssessment = { ok: true } | { ok: false; reason: string }
export type TargetAssessment = { ok: true } | { ok: false; reasons: string[] }

export declare function parseAllowedRemoteHosts(value: string | undefined | null): string[]
export declare function isLocalHostname(hostname: string | undefined | null): boolean
export declare function assessUrl(
  label: string,
  value: string | undefined | null,
  allowedRemoteHosts?: readonly string[],
): UrlAssessment
export declare function assessTestTarget(target?: TestTarget): TargetAssessment
export declare function assertSafeTestTarget(target?: TestTarget): void
export declare function readEnvFile(path: string): Record<string, string>

export declare class UnsafeTestTargetError extends Error {
  readonly reasons: string[]
  constructor(reasons: string[])
}
