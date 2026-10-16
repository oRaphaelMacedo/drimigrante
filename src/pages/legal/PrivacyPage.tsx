import { Link } from 'react-router-dom'
import { LegalLayout } from './LegalLayout'
import { useSEO } from '@/hooks/useSEO'
import { isMetaPixelConfigured } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { PRIVACY_EMAIL, mailtoHref } from '@/config/contact'
import { COMPANY, getCompanyIdentification } from '@/data/company'
import { RETENTION } from '@/lib/retention'

const LAST_UPDATED = '16 de outubro de 2026'

const PRIVACY_SETTINGS_PATH = '/dashboard/settings?aba=privacidade'

export function PrivacyPage() {
  useSEO({ title: 'Política de Privacidade', description: 'Como tratamos os seus dados pessoais.' })
  const metaPixel = isMetaPixelConfigured()
  const companyFields = getCompanyIdentification()
  const privacyMailto = mailtoHref(PRIVACY_EMAIL, 'Pedido sobre meus dados')

  return (
    <LegalLayout title="Política de Privacidade" subtitle={`Última atualização: ${LAST_UPDATED}`}>
      <h2>1. Responsável pelo tratamento</h2>
      <p>
        {COMPANY.brandName} — contato de privacidade: <a href={privacyMailto}>{PRIVACY_EMAIL}</a>
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

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Identificação:</strong> nome, e-mail e telefone (opcional).
        </li>
        <li>
          <strong>Perfil migratório:</strong> nacionalidade, situação e respostas ao quiz.
        </li>
        <li>
          <strong>O que você envia no painel:</strong> mensagens do chat IA e documentos enviados.
        </li>
        <li>
          <strong>Pagamento:</strong> processado pela Stripe (não armazenamos dados de cartão).
        </li>
        <li>
          <strong>Origem da visita:</strong> parâmetros de campanha (utm) do link pelo qual você chegou, guardados
          junto com o seu diagnóstico.
        </li>
        <li>
          <strong>Técnicos:</strong> endereço IP, dispositivo e navegador. Cookies de estatística e de marketing só
          com o seu consentimento.
        </li>
      </ul>

      <h2>3. Finalidades e base legal</h2>
      <ul>
        <li>
          <strong>Execução do contrato:</strong> entregar o serviço pago.
        </li>
        <li>
          <strong>Consentimento:</strong> estatísticas de uso, marketing, cookies não essenciais e comunicações.
        </li>
        <li>
          <strong>Obrigação legal:</strong> faturamento e conservação fiscal.
        </li>
        <li>
          <strong>Interesse legítimo:</strong> segurança, prevenção de fraude e correção de erros técnicos.
        </li>
      </ul>

      <h2>4. Compartilhamento com terceiros</h2>
      <ul>
        <li>
          <strong>Supabase</strong> — hospedagem de dados (servidores no Brasil, em São Paulo).
        </li>
        <li>
          <strong>Stripe</strong> — processamento de pagamentos.
        </li>
        <li>
          <strong>Resend</strong> — envio de e-mails transacionais.
        </li>
        <li>
          <strong>OpenAI</strong> — geração de análises (sem treino sobre os dados).
        </li>
        <li>
          <strong>Sentry</strong> — monitoramento de erros técnicos (veja a seção 5).
        </li>
        <li>
          <strong>PostHog e Google Analytics 4</strong> — estatísticas de uso, só com o seu consentimento.
        </li>
        {metaPixel && (
          <li>
            <strong>Meta (Pixel)</strong> — medição de campanhas de anúncios, só com o seu consentimento de
            marketing.
          </li>
        )}
      </ul>

      <h2>5. Estatísticas, marketing e monitoramento de erros</h2>
      <ul>
        <li>
          As ferramentas de estatística (PostHog e Google Analytics 4) só são carregadas depois que você aceita os
          cookies de estatística. Antes disso, nenhum dado é enviado a elas.
        </li>
        <li>
          Antes de qualquer envio, removemos do endereço da página códigos de acesso, identificadores de pagamento e
          e-mails. A gravação de sessão do PostHog fica desativada.
        </li>
        <li>
          Quando algo falha no site, o Sentry registra o erro técnico (página, navegador e as ações que levaram ao
          erro) para que possamos corrigi-lo, com base no interesse legítimo. E-mails e códigos de acesso são
          removidos antes do envio.
        </li>
        <li>
          Se você aceitar os cookies de estatística, o Sentry também pode medir o tempo de carregamento das páginas e
          guardar uma reprodução da sessão com todo o texto, os campos e as imagens mascarados. A reprodução só é
          enviada quando ocorre um erro.
        </li>
        {metaPixel && (
          <li>
            Se você aceitar também os cookies de marketing (opção “Aceitar estatísticas e marketing” na Política de
            Cookies), o Pixel da Meta registra as visitas às páginas e os eventos de cadastro, início de pagamento e
            compra, para medir campanhas de anúncios. O botão “Aceitar” do aviso de cookies não inclui marketing.
          </li>
        )}
        <li>
          Você pode mudar a sua escolha a qualquer momento na <Link to="/cookies">Política de Cookies</Link>.
        </li>
      </ul>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          <strong>Diagnóstico feito sem conta:</strong> se você fez o quiz e não comprou a análise, o nome, o e-mail,
          o telefone e os dados técnicos (IP e navegador) são removidos {RETENTION.anonymousAssessmentDays} dias
          depois do diagnóstico. As respostas, sem identificação, podem continuar nas nossas estatísticas.
        </li>
        <li>
          <strong>Lista de espera:</strong> se você pediu aviso de um serviço que ainda não está disponível, guardamos
          o contato por até {RETENTION.waitlistMonths} meses depois da inscrição.
        </li>
        <li>
          <strong>Conta:</strong> perfil, diagnósticos, análise, conversas do chat IA e documentos ficam guardados
          enquanto a conta existir, também depois do fim do acesso de {OFFER.accessDays} dias. Você pode apagar a
          conta quando quiser (seção 7).
        </li>
        <li>
          <strong>Registros de pagamento:</strong> valor, data e identificadores da Stripe são guardados pelo prazo
          exigido pela legislação fiscal e contábil, mesmo depois que você apaga a conta, sem ligação com o seu
          perfil.
        </li>
        <li>
          <strong>E-mails que enviamos:</strong> o conteúdo da mensagem é apagado dos nossos registros depois de{' '}
          {RETENTION.emailContentDays} dias. Para quem não tem conta, o endereço de e-mail é removido do registro
          depois de {RETENTION.emailAddressDays} dias.
        </li>
        <li>
          <strong>Dados anônimos</strong> (sem nada que identifique você) podem ser mantidos para estatística.
        </li>
      </ul>

      <h2>7. Seus direitos (LGPD e RGPD)</h2>
      <p>
        Você tem direito de confirmar se tratamos seus dados e de acessá-los, corrigi-los, levá-los para outro
        serviço (portabilidade), apagá-los, limitar ou se opor a um tratamento e retirar o consentimento.
      </p>
      <ul>
        <li>
          <strong>Baixar seus dados:</strong> em <Link to={PRIVACY_SETTINGS_PATH}>Conta → Privacidade</Link>, o botão
          “Baixar meus dados” gera um arquivo com o seu perfil, plano, diagnósticos e análise, conversas do chat IA,
          lista de documentos, pagamentos e e-mails enviados.
        </li>
        <li>
          <strong>Apagar a conta:</strong> na mesma página, “Apagar minha conta” remove o perfil, os diagnósticos
          (inclusive os feitos antes do cadastro com o mesmo e-mail), a análise, as conversas, os documentos e o
          acesso. Pedimos que você digite o seu e-mail para confirmar. Uma assinatura de{' '}
          {OFFER.recurring.priceLabel} ativa é cancelada na hora. Só os registros de pagamento continuam guardados,
          como explicado na seção 6.
        </li>
        <li>
          <strong>Corrigir:</strong> nome e telefone podem ser editados em Conta → Perfil.
        </li>
        <li>
          <strong>Comunicações e cookies:</strong> ajuste os e-mails de novidades em Conta → Notificações e os
          cookies na <Link to="/cookies">Política de Cookies</Link>.
        </li>
        <li>
          <strong>Sem conta ou outros pedidos:</strong> escreva para <a href={privacyMailto}>{PRIVACY_EMAIL}</a>{' '}
          (por exemplo, para apagar um diagnóstico feito sem conta).
        </li>
      </ul>
      <p>
        Você também pode apresentar reclamação à ANPD, no Brasil (
        <a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer">
          gov.br/anpd
        </a>
        ), ou à CNPD, em Portugal (
        <a href="https://www.cnpd.pt" target="_blank" rel="noreferrer">
          cnpd.pt
        </a>
        ).
      </p>

      <h2>8. Segurança</h2>
      <p>
        TLS em trânsito, criptografia em repouso, controles de acesso por RLS e autenticação multifator para a
        equipe.
      </p>

      <h2>9. Transferências internacionais</h2>
      <p>
        Quando ocorrem (por exemplo, Supabase no Brasil; OpenAI, PostHog e Google Analytics nos EUA), são protegidas
        por Cláusulas Contratuais Padrão da UE.
      </p>
    </LegalLayout>
  )
}
