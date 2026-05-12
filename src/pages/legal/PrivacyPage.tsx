import { LegalLayout } from './LegalLayout'
import { useSEO } from '@/hooks/useSEO'

export function PrivacyPage() {
  useSEO({ title: 'Política de Privacidade', description: 'Como tratamos os seus dados pessoais.' })
  return (
    <LegalLayout
      title="Política de Privacidade"
      subtitle="Última atualização: 12 de Maio de 2026"
    >
      <h2>1. Responsável pelo Tratamento</h2>
      <p>
        Doutor Imigrante — contacto: <a href="mailto:privacidade@drimigrante.com">privacidade@drimigrante.com</a>
      </p>

      <h2>2. Dados Recolhidos</h2>
      <ul>
        <li><strong>Identificação:</strong> nome, email, telefone (opcional).</li>
        <li><strong>Perfil migratório:</strong> nacionalidade, situação, respostas ao quiz.</li>
        <li><strong>Pagamento:</strong> processado pela Stripe (não armazenamos dados de cartão).</li>
        <li><strong>Técnicos:</strong> IP, dispositivo, navegador, cookies (com consentimento).</li>
      </ul>

      <h2>3. Finalidades e Base Legal</h2>
      <ul>
        <li><strong>Execução do contrato:</strong> entregar o serviço pago.</li>
        <li><strong>Consentimento:</strong> marketing, cookies analíticos, comunicações.</li>
        <li><strong>Obrigação legal:</strong> faturação, conservação fiscal.</li>
        <li><strong>Interesse legítimo:</strong> segurança, prevenção de fraude.</li>
      </ul>

      <h2>4. Partilha com Terceiros</h2>
      <ul>
        <li><strong>Supabase</strong> — alojamento de dados (UE/Brasil).</li>
        <li><strong>Stripe</strong> — processamento de pagamentos.</li>
        <li><strong>Resend</strong> — envio de emails transacionais.</li>
        <li><strong>OpenAI</strong> — geração de análises (sem treino sobre os dados).</li>
        <li><strong>PostHog, GA4, Sentry</strong> — analytics e monitorização (com consentimento).</li>
      </ul>

      <h2>5. Conservação</h2>
      <p>
        Dados de cliente: enquanto a conta estiver activa + 5 anos (obrigações fiscais).
        Dados anónimos: indefinidamente para fins estatísticos.
      </p>

      <h2>6. Direitos do Titular (RGPD)</h2>
      <p>
        Tem direito de acesso, retificação, apagamento, limitação, portabilidade e oposição.
        Para exercer: <a href="mailto:privacidade@drimigrante.com">privacidade@drimigrante.com</a>.
        Pode também reclamar à CNPD (<a href="https://www.cnpd.pt" target="_blank" rel="noreferrer">cnpd.pt</a>).
      </p>

      <h2>7. Segurança</h2>
      <p>
        TLS em trânsito, criptografia em repouso, controlos de acesso por RLS, autenticação multifactor para staff.
      </p>

      <h2>8. Transferências Internacionais</h2>
      <p>
        Quando ocorrem (ex.: OpenAI nos EUA), são salvaguardadas por Cláusulas Contratuais Padrão da UE.
      </p>
    </LegalLayout>
  )
}
