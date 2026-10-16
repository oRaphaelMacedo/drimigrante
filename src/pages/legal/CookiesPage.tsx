import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { LegalLayout } from './LegalLayout'
import { useSEO } from '@/hooks/useSEO'
import { getConsentChoice, isMetaPixelConfigured, setConsent, type ConsentChoice } from '@/lib/analytics'
import { onConsentChange } from '@/lib/consent'
import { cn } from '@/lib/utils'

const CHOICE_LABEL: Record<ConsentChoice, string> = {
  granted: 'todos os cookies aceitos',
  analytics: 'só cookies essenciais e de estatística',
  denied: 'só cookies essenciais',
}

interface Option {
  choice: ConsentChoice
  label: string
}

export function CookiesPage() {
  useSEO({ title: 'Política de Cookies', description: 'Política e gestão de cookies.' })
  const metaPixel = isMetaPixelConfigured()
  const [choice, setChoice] = useState<ConsentChoice | null>(() => getConsentChoice())
  const [saved, setSaved] = useState(false)

  useEffect(() => onConsentChange((next) => setChoice(next)), [])

  const options: Option[] = metaPixel
    ? [
        { choice: 'granted', label: 'Aceitar todos' },
        { choice: 'analytics', label: 'Só estatísticas' },
        { choice: 'denied', label: 'Recusar não essenciais' },
      ]
    : [
        { choice: 'granted', label: 'Aceitar estatísticas' },
        { choice: 'denied', label: 'Recusar não essenciais' },
      ]

  // Sem Pixel configurado, 'granted' e 'analytics' têm o mesmo efeito.
  const isSelected = (option: ConsentChoice) =>
    choice === option || (!metaPixel && option === 'granted' && choice === 'analytics')

  const choose = (next: ConsentChoice) => {
    setConsent(next)
    setChoice(next)
    setSaved(true)
  }

  return (
    <LegalLayout title="Política de Cookies" subtitle="Última atualização: 16 de outubro de 2026">
      <h2>O que são cookies?</h2>
      <p>
        Cookies são pequenos arquivos guardados no seu dispositivo. Também usamos tecnologias parecidas, como o
        armazenamento local do navegador (localStorage e sessionStorage). Nesta página, chamamos tudo de cookies.
      </p>

      <h2>Cookies que usamos</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Para que serve</th>
              <th scope="col">Duração</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Essenciais</td>
              <td>Login e sessão (Supabase) e a sua escolha de cookies.</td>
              <td>Até você sair da conta ou mudar a escolha</td>
            </tr>
            <tr>
              <td>Funcionais</td>
              <td>
                Progresso e resultado do quiz neste aparelho; origem da visita (parâmetros utm do link pelo qual você
                chegou).
              </td>
              <td>Quiz: até você limpar os dados do navegador. Origem: até fechar a aba</td>
            </tr>
            <tr>
              <td>Estatísticas (com consentimento)</td>
              <td>
                PostHog e Google Analytics 4: como o site é usado, sem gravação de tela. Sentry: reprodução da sessão
                com texto, campos e imagens mascarados, enviada só quando ocorre um erro.
              </td>
              <td>PostHog e GA4: até 2 anos. Sentry: até fechar a aba</td>
            </tr>
            {metaPixel && (
              <tr>
                <td>Marketing (com consentimento)</td>
                <td>Pixel da Meta: medir campanhas de anúncios (visitas, cadastro, início de pagamento e compra).</td>
                <td>Até 90 dias</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p>
        O registro de erros técnicos do Sentry não usa cookies e funciona sem consentimento, com e-mails e códigos de
        acesso removidos. Veja a <Link to="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>Gerir consentimento</h2>
      <p>
        Você pode mudar a sua preferência a qualquer momento. Se recusar, as ferramentas de estatística
        {metaPixel ? ' e de marketing' : ''} não são carregadas; se você tinha aceitado antes, paramos o envio e
        apagamos os cookies do Google Analytics{metaPixel ? ' e da Meta' : ''} deste site.
      </p>
      <p data-testid="cookie-current-choice">
        <strong>Sua escolha atual:</strong> {choice ? CHOICE_LABEL[choice] : 'você ainda não escolheu'}.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row" role="group" aria-label="Preferência de cookies">
        {options.map((option) => {
          const selected = isSelected(option.choice)
          return (
            <button
              key={option.choice}
              type="button"
              onClick={() => choose(option.choice)}
              aria-pressed={selected}
              data-testid={`cookie-choice-${option.choice}`}
              className={cn(
                'inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-card px-5 text-base font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected ? 'border-primary ring-1 ring-primary' : 'border-border',
              )}
            >
              {selected && <Check className="h-4 w-4 text-primary" aria-hidden />}
              {option.label}
            </button>
          )
        })}
      </div>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {saved ? 'Preferência salva.' : ''}
      </p>
    </LegalLayout>
  )
}
