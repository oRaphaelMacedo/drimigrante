import { Link } from 'react-router-dom'
import { LegalLayout } from './LegalLayout'
import { useSEO } from '@/hooks/useSEO'
import { isMetaPixelConfigured } from '@/lib/analytics'

// TODO(integração com o W1-01): importar PRIVACY_EMAIL de '@/config/contact'.
const PRIVACY_EMAIL = 'privacidade@drimigrante.com'

export function PrivacyPage() {
  useSEO({ title: 'Política de Privacidade', description: 'Como tratamos os seus dados pessoais.' })
  const metaPixel = isMetaPixelConfigured()

  return (
    <LegalLayout title="Política de Privacidade" subtitle="Última atualização: 16 de outubro de 2026">
      <h2>1. Responsável pelo tratamento</h2>
      <p>
        Doutor Imigrante — contato: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Identificação:</strong> nome, e-mail e telefone (opcional).
        </li>
        <li>
          <strong>Perfil migratório:</strong> nacionalidade, situação e respostas ao quiz.
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

      <h2>6. Conservação</h2>
      <p>
        Dados de cliente: enquanto a conta estiver ativa, mais 5 anos (obrigações fiscais). Dados anônimos:
        indefinidamente, para fins estatísticos.
      </p>

      <h2>7. Direitos do titular (RGPD)</h2>
      <p>
        Você tem direito de acesso, retificação, apagamento, limitação, portabilidade e oposição. Para exercer esses
        direitos, escreva para <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Você também pode apresentar
        reclamação à CNPD (
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
