/**
 * stored-session — há uma sessão do Supabase guardada neste navegador?
 *
 * Leitura síncrona, sem rede, para decidir a primeira pintura antes de o
 * AuthContext receber o INITIAL_SESSION (que pode esperar a renovação do token):
 *  - PWA aberto com `?source=pwa`: só espera a sessão (em vez de mostrar a
 *    landing e pular para o painel) quando existe uma sessão guardada;
 *  - banner de visitante que voltou: sem sessão guardada aparece já na primeira
 *    pintura (sem deslocar a página depois).
 *
 * O supabase-js guarda a sessão em `sb-<ref do projeto>-auth-token` (padrão;
 * src/lib/supabase.ts não muda o storageKey). É só uma pista: quem decide se a
 * pessoa está logada continua sendo o AuthContext.
 */

const SUPABASE_SESSION_KEY = /^sb-[a-z0-9-]+-auth-token$/i

export function hasStoredAuthSession(storage?: Pick<Storage, 'length' | 'key' | 'getItem'> | null): boolean {
  try {
    const store = storage === undefined ? window.localStorage : storage
    if (!store) return false
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (!key || !SUPABASE_SESSION_KEY.test(key)) continue
      const value = store.getItem(key)
      if (value && value !== 'null') return true
    }
  } catch {
    // storage bloqueado: trata como sem sessão guardada
  }
  return false
}
