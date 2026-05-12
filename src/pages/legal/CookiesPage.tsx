import { LegalLayout } from './LegalLayout'
import { setConsent } from '@/lib/analytics'
import { useSEO } from '@/hooks/useSEO'

export function CookiesPage() {
  useSEO({ title: 'Política de Cookies', description: 'Política e gestão de cookies.' })
  return (
    <LegalLayout
      title="Política de Cookies"
      subtitle="Última atualização: 12 de Maio de 2026"
    >
      <h2>O que são cookies?</h2>
      <p>
        Cookies são pequenos ficheiros guardados no seu dispositivo que permitem reconhecer o
        utilizador e melhorar a experiência de navegação.
      </p>

      <h2>Cookies que utilizamos</h2>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Finalidade</th>
            <th>Duração</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Essenciais</td>
            <td>Autenticação, sessão, segurança (Supabase)</td>
            <td>Sessão / 7 dias</td>
          </tr>
          <tr>
            <td>Analytics</td>
            <td>PostHog, Google Analytics — métricas anónimas</td>
            <td>Até 2 anos</td>
          </tr>
          <tr>
            <td>Funcionais</td>
            <td>Estado do quiz, preferências (localStorage)</td>
            <td>Persistente</td>
          </tr>
        </tbody>
      </table>

      <h2>Gerir consentimento</h2>
      <p>
        Pode alterar a sua preferência a qualquer momento:
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => setConsent('granted')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Aceitar todos
        </button>
        <button
          onClick={() => setConsent('denied')}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          Rejeitar não-essenciais
        </button>
      </div>
    </LegalLayout>
  )
}
