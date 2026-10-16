import { Link } from 'react-router-dom'
import { LegalLayout } from './LegalLayout'
import { useSEO } from '@/hooks/useSEO'
import { OFFER } from '@/lib/offer'
import { COMPANY, getCompanyIdentification } from '@/data/company'
import { HAS_WHATSAPP, PRIVACY_EMAIL, SUPPORT_EMAIL, WHATSAPP_URL, mailtoHref } from '@/config/contact'

const LAST_UPDATED = '16 de outubro de 2026'

export function TermsPage() {
  useSEO({ title: 'Termos e condições', description: 'Termos e condições de uso do Doutor Imigrante.' })

  const companyFields = getCompanyIdentification()
  const { recurring } = OFFER

  return (
    <LegalLayout title="Termos e condições" subtitle={`Última atualização: ${LAST_UPDATED}`}>
      <h2>1. Identificação</h2>
      <p>
        O <strong>{COMPANY.brandName}</strong> é uma plataforma online de pré-análise de elegibilidade para a
        nacionalidade portuguesa e outras formas de residência legal em Portugal. O serviço é informativo: não
        constitui aconselhamento jurídico vinculativo nem substitui a consulta com um advogado.
      </p>
      {companyFields.length > 0 && (
        <ul>
          {companyFields.map((field) => (
            <li key={field.key}>
              <strong>{field.label}:</strong> {field.value}
            </li>
          ))}
        </ul>
      )}

      <h2>2. Aceitação</h2>
      <p>
        Ao usar a plataforma, você aceita estes Termos e a{' '}
        <Link to="/privacidade">Política de Privacidade</Link>. Se não concordar, não use o serviço.
      </p>

      <h2>3. Serviços</h2>
      <ul>
        <li>
          <strong>Diagnóstico gratuito.</strong> Questionário com um resultado preliminar por categoria (elegibilidade
          alta, média ou baixa).
        </li>
        <li>
          <strong>Análise completa ({OFFER.priceLabel}, pagamento único).</strong> {OFFER.delivery}. O acesso ao
          painel{OFFER.includesChat ? ' e ao chat IA' : ''} dura {OFFER.accessDays} dias, contados a partir da
          confirmação do pagamento. Inclui:
          <ul className="mt-2">
            {OFFER.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </li>
        <li>
          <strong>Acompanhamento contínuo ({recurring.priceLabel}, opcional).</strong> Disponível só para quem já
          comprou a análise completa. A assinatura é renovada automaticamente a cada mês, com limite de{' '}
          {recurring.maxCycles} cobranças mensais; depois disso, termina sem novas cobranças. Permite:
          <ul className="mt-2">
            {recurring.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </li>
      </ul>

      <h2>4. Pagamentos, cancelamento e reembolso</h2>
      <p>Os pagamentos são processados pela Stripe, em euros (EUR).</p>
      <p>
        Você pode cancelar o acompanhamento contínuo a qualquer momento pelo e-mail{' '}
        <a href={mailtoHref(SUPPORT_EMAIL, 'Cancelar acompanhamento contínuo')}>{SUPPORT_EMAIL}</a>. O cancelamento
        vale para as cobranças seguintes, e o acesso continua até o fim do período já pago.
      </p>
      {OFFER.guarantee ? (
        <p>
          <strong>Reembolso:</strong> {OFFER.guarantee}
        </p>
      ) : (
        <p>
          Para pedir reembolso, escreva para{' '}
          <a href={mailtoHref(SUPPORT_EMAIL, 'Pedido de reembolso')}>{SUPPORT_EMAIL}</a>. Ficam ressalvados os
          direitos previstos na legislação de defesa do consumidor aplicável.
        </p>
      )}

      <h2>5. Responsabilidade</h2>
      <p>
        A análise é informativa e gerada automaticamente a partir das suas respostas, com regras de elegibilidade e
        textos produzidos com apoio de inteligência artificial
        {OFFER.reviewedBy ? `, e revisada por ${OFFER.reviewedBy}` : ''}. As decisões oficiais cabem exclusivamente
        às autoridades portuguesas competentes, como a AIMA, o IRN (Conservatória dos Registos Centrais) e os
        consulados. O {COMPANY.brandName} não se responsabiliza por decisões tomadas apenas com base nas análises.
      </p>

      <h2>6. Propriedade intelectual</h2>
      <p>
        Todo o conteúdo, a marca, o código e os materiais da plataforma pertencem ao {COMPANY.brandName}. É proibida a
        reprodução sem autorização por escrito.
      </p>

      <h2>7. Conta e dados pessoais</h2>
      <p>
        Você pode pedir o encerramento da sua conta a qualquer momento pelo e-mail{' '}
        <a href={mailtoHref(SUPPORT_EMAIL, 'Encerrar conta')}>{SUPPORT_EMAIL}</a>. Seus dados são tratados conforme a{' '}
        <Link to="/privacidade">Política de Privacidade</Link>; para exercer seus direitos sobre dados pessoais,
        escreva para <a href={mailtoHref(PRIVACY_EMAIL)}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>8. Lei aplicável</h2>
      <p>Estes Termos são regidos pela lei portuguesa. Foro: Tribunal da Comarca de Lisboa.</p>

      <h2>9. Contato</h2>
      <p>
        E-mail: <a href={mailtoHref(SUPPORT_EMAIL)}>{SUPPORT_EMAIL}</a>
        {HAS_WHATSAPP && (
          <>
            {' '}
            · WhatsApp:{' '}
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              enviar mensagem
            </a>
          </>
        )}
      </p>
    </LegalLayout>
  )
}
