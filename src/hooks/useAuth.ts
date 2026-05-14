/**
 * useAuth — re-exports from AuthContext for backwards compatibility.
 * All imports of `@/hooks/useAuth` continue to work without changes.
 *
 * Logic has moved to src/contexts/AuthContext.tsx (B04-A01 fix).
 */
export { useAuth, AuthProvider } from '@/contexts/AuthContext'
export type { AuthUser, UseAuthReturn } from '@/contexts/AuthContext'
