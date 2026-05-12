import { LegalLayout } from './LegalLayout'
import { useSEO } from '@/hooks/useSEO'

export function TermsPage() {
  useSEO({ title: 'Termos e Condições', description: 'Termos e condições de utilização do Doutor Imigrante.' })
  return (
    <LegalLayout
      title="Termos e Condições"
      subtitle="Última atualização: 12 de Maio de 2026"
    >
      <h2>1. Identificação</h2>
      <p>
        <strong>Doutor Imigrante</strong> é uma plataforma online de pré-análise de elegibilidade
        para vistos e autorizações de residência em Portugal. Não constitui aconselhamento
        jurídico vinculativo nem substitui a consulta com advogado.
      </p>

      <h2>2. Aceitação</h2>
      <p>
        Ao utilizar este serviço, o utilizador aceita estes Termos e a Política de Privacidade.
        Se não concordar, não utilize a plataforma.
      </p>

      <h2>3. Serviços</h2>
      <ul>
        <li><strong>Quiz gratuito:</strong> Análise preliminar categórica de elegibilidade.</li>
        <li><strong>Análise Profissional (€30, pagamento único):</strong> Relatório jurídico detalhado, dashboard inicial e chat IA limitado.</li>
        <li><strong>Acompanhamento Contínuo (€4,90/mês):</strong> Atualizações regulatórias, chat IA ilimitado e suporte estendido.</li>
      </ul>

      <h2>4. Pagamentos e Reembolso</h2>
      <p>
        Pagamentos processados pela Stripe. O pagamento único de €30 não é reembolsável após
        emissão da análise. A subscrição mensal pode ser cancelada a qualquer momento; o acesso
        mantém-se até ao fim do período pago.
      </p>

      <h2>5. Responsabilidade</h2>
      <p>
        A análise é informativa. Decisões oficiais cabem exclusivamente às autoridades portuguesas
        (AIMA, consulados, SEF). O Doutor Imigrante não se responsabiliza por decisões tomadas
        com base unicamente nos relatórios.
      </p>

      <h2>6. Propriedade Intelectual</h2>
      <p>
        Todo o conteúdo, marca, código e materiais são propriedade do Doutor Imigrante. É proibida
        a reprodução sem autorização escrita.
      </p>

      <h2>7. Cancelamento e Conta</h2>
      <p>
        Pode encerrar a conta a qualquer momento em <em>Definições</em>. Os dados serão tratados
        conforme a Política de Privacidade.
      </p>

      <h2>8. Lei Aplicável</h2>
      <p>
        Estes Termos regem-se pela lei portuguesa. Foro: Tribunal da Comarca de Lisboa.
      </p>

      <h2>9. Contacto</h2>
      <p>
        Email: <a href="mailto:contacto@drimigrante.com">contacto@drimigrante.com</a>
      </p>
    </LegalLayout>
  )
}
