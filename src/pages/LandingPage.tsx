import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigationType } from 'react-router-dom'
import { ArrowRight, Check, ClipboardList, Gauge, Unlock } from 'lucide-react'
import { track } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { COMPANY, getCompanyIdentification } from '@/data/company'
import { HAS_WHATSAPP, SUPPORT_EMAIL, WHATSAPP_URL, mailtoHref } from '@/config/contact'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { Faq, type FaqItem } from '@/components/landing/Faq'
import { MobileStickyCta } from '@/components/landing/MobileStickyCta'
import { Testimonials } from '@/components/landing/Testimonials'

/**
 * Landing (DI-034, DI-035).
 *
 * Regras de copy (PRODUCT.md): o produto é o diagnóstico de NACIONALIDADE
 * portuguesa; antes do pagamento só aparece a oferta única (`OFFER`), nunca o
 * plano mensal; sem garantia, revisão humana ou prazo enquanto `OFFER` disser
 * `null`; prova social só com dados reais (Testimonials vem vazio).
 */

const QUIZ_CTA_LABEL = 'Fazer o diagnóstico grátis'
const MICROCOPY = 'Grátis · sem criar conta · poucos minutos'

type CtaPosition = 'hero' | 'pricing' | 'final'

const trackCta = (position: CtaPosition) => track('landing_cta_clicked', { position })

const STEPS = [
  {
    icon: ClipboardList,
    title: 'Responda às perguntas',
    desc: 'Sobre família, casamento ou tempo em Portugal. Só as que valem para o seu caso.',
  },
  {
    icon: Gauge,
    title: 'Veja o pré-resultado na hora',
    desc: 'Com nome e e-mail, você vê se a elegibilidade é alta, média ou em desenvolvimento.',
  },
  {
    icon: Unlock,
    title: 'Se quiser, desbloqueie a análise',
    desc: `Por ${OFFER.priceLabel}, pagamento único: detalhes de cada caminho e próximos passos, por ${OFFER.accessDays} dias.`,
  },
] as const

function buildFaqItems(): FaqItem[] {
  const identification = getCompanyIdentification()
  const accessIncludes = OFFER.includesChat ? 'o painel, a análise e o chat IA' : 'o painel e a análise'

  return [
    {
      id: 'gratis',
      question: 'O diagnóstico é grátis mesmo?',
      answer: (
        <p>
          Sim. As perguntas e o pré-resultado não custam nada e não pedem cartão. No fim, você informa nome e e-mail
          para ver o resultado, sem criar conta. Só a análise completa é paga, e você decide depois de ver o
          pré-resultado.
        </p>
      ),
    },
    {
      id: 'tempo',
      question: 'Quanto tempo leva?',
      answer: (
        <p>
          Poucos minutos. O número de perguntas muda conforme as suas respostas: cada pessoa só vê as que se aplicam
          ao próprio caso.
        </p>
      ),
    },
    {
      id: 'analise',
      question: 'O que vem na análise completa?',
      answer: (
        <>
          <ul className="list-disc space-y-1 pl-5">
            {OFFER.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            {OFFER.delivery}. A análise é gerada a partir das suas respostas
            {OFFER.reviewedBy ? ` e revisada por ${OFFER.reviewedBy}` : ''}. Ela é informativa e não substitui a
            orientação de um advogado.
          </p>
        </>
      ),
    },
    {
      id: 'acesso',
      question: `O acesso dura ${OFFER.accessDays} dias?`,
      answer: (
        <p>
          Sim. São {OFFER.accessDays} dias a partir da confirmação do pagamento, com {accessIncludes}. É um pagamento
          único, sem renovação automática. Depois do prazo, os documentos que você enviou continuam disponíveis para
          baixar ou apagar.
        </p>
      ),
    },
    {
      id: 'resultado-baixo',
      question: 'E se o meu resultado for baixo?',
      answer: (
        <p>
          Você vê isso antes de pagar qualquer coisa. Quando o perfil ainda está em desenvolvimento, o pré-resultado
          mostra isso e os caminhos a explorar. A compra é opcional: a análise explica os requisitos de cada caminho,
          mas não muda o que a lei exige.
        </p>
      ),
    },
    {
      id: 'dados',
      question: 'Como vocês usam os meus dados?',
      answer: (
        <p>
          As suas respostas e o seu contato servem para gerar o diagnóstico e a análise, como descreve a{' '}
          <Link to="/privacidade">Política de Privacidade</Link>, onde também estão os seus direitos. Cookies de
          estatística e de marketing só são usados se você aceitar.
        </p>
      ),
    },
    {
      id: 'quem-somos',
      question: 'Quem está por trás do serviço?',
      answer: (
        <>
          <p>
            O {COMPANY.brandName} é um serviço digital de diagnóstico de elegibilidade à nacionalidade portuguesa. As
            informações do site não constituem aconselhamento jurídico.
          </p>
          {identification.length > 0 && (
            <dl className="space-y-1" data-testid="landing-company-identification">
              {identification.map((field) => (
                <div key={field.key}>
                  <dt className="inline font-semibold text-foreground">{field.label}: </dt>
                  <dd className="inline">{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p>
            Fale com a gente pelo e-mail <a href={mailtoHref(SUPPORT_EMAIL)}>{SUPPORT_EMAIL}</a>
            {HAS_WHATSAPP ? (
              <>
                {' '}
                ou pelo{' '}
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </>
            ) : null}
            .
          </p>
        </>
      ),
    },
  ]
}

/**
 * Âncoras da landing (/#como-funciona, /#precos) — DI-038.
 *
 * O <ScrollRestoration/> do Layout já rola até o hash no commit da navegação;
 * este efeito repete a rolagem depois da pintura, para o caso de a seção ainda
 * não existir ou mudar de lugar (chunk lazy, fontes). Voltar/avançar (POP) fica
 * com a posição salva, exceto na entrada sem estado do router (`key` 'default':
 * link externo ou URL digitada), em que vale o hash.
 */
function useScrollToHash() {
  const { hash, key } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (!hash) return
    if (navigationType === 'POP' && key !== 'default') return
    let id: string
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hash, key, navigationType])
}

/** Prévia ILUSTRATIVA do pré-resultado (rotulada; não é um resultado real). */
function ResultPreview() {
  return (
    <figure className="mx-auto w-full max-w-sm md:mx-0 md:justify-self-end">
      <figcaption className="mb-2 text-sm font-medium text-primary-foreground/90">
        Exemplo ilustrativo do pré-resultado
      </figcaption>
      <Card aria-hidden="true" variant="elevated" className="p-4 text-left sm:p-6">
        <p className="mb-3 text-lg font-semibold text-[hsl(var(--success))]">Perfil de alta elegibilidade</p>
        <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-4/5 rounded-full bg-[hsl(var(--success))]" />
        </div>
        <ul className="space-y-2">
          <li className="rounded-xl border border-primary/20 bg-primary/[.05] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Nacionalidade por descendência</span>
              <Badge size="sm" variant="success">
                Alta
              </Badge>
            </div>
            <p className="mt-1 hidden select-none text-sm text-muted-foreground blur-[3px] sm:block">
              Detalhes na análise completa do caminho
            </p>
          </li>
          <li className="hidden items-center justify-between gap-2 rounded-xl border border-border bg-muted p-3 sm:flex">
            <span className="text-sm font-semibold text-foreground">Casamento ou união estável</span>
            <Badge size="sm" variant="warning">
              Possível
            </Badge>
          </li>
        </ul>
      </Card>
    </figure>
  )
}

export function LandingPage() {
  useScrollToHash()
  // Âncora do CTA fixo: a linha do CTA do hero (no celular o hero é alto; a barra
  // aparece assim que o botão principal sai da tela, não só depois da prévia).
  const heroCtaRef = useRef<HTMLDivElement>(null)
  const pricingCtaRef = useRef<HTMLAnchorElement>(null)
  const finalRef = useRef<HTMLElement>(null)
  const faqItems = buildFaqItems()

  return (
    <div>
      {/* Hero: cobalto chapado com o motivo de azulejo (único lugar da página). */}
      <section
        aria-labelledby="landing-title"
        className="bg-primary bg-azulejo-inverse text-primary-foreground"
      >
        <Container className="grid items-center gap-6 py-10 sm:py-20 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-12">
          <div>
            <h1 id="landing-title" className="text-display text-primary-foreground">
              Descubra se você tem direito à nacionalidade portuguesa
            </h1>
            <p className="mt-3 max-w-xl text-base text-primary-foreground/90 sm:mt-4 sm:text-lg">
              Responda a algumas perguntas e veja, na hora, os caminhos possíveis para o seu caso.
            </p>
            <div ref={heroCtaRef} className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
              <Button asChild variant="secondary" size="lg" className="w-full border-transparent text-primary sm:w-auto">
                <Link to="/quiz" data-testid="cta-start-quiz-hero" onClick={() => trackCta('hero')}>
                  {QUIZ_CTA_LABEL}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <p className="text-center text-sm text-primary-foreground/90 sm:order-last sm:basis-full sm:text-left">
                {MICROCOPY}
              </p>
              {/* Link do router (e não <a href="#">): a rolagem passa pelo ScrollRestoration. */}
              <Link
                to="/#como-funciona"
                className="inline-flex min-h-11 items-center justify-center self-center rounded-lg px-3 text-base font-medium text-primary-foreground underline decoration-primary-foreground/50 underline-offset-4 hover:decoration-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground sm:self-auto"
              >
                Como funciona
              </Link>
            </div>
          </div>
          <ResultPreview />
        </Container>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" aria-labelledby="landing-como-funciona" className="scroll-mt-16 py-12 sm:py-20">
        <Container>
          <h2 id="landing-como-funciona" className="mb-6 text-h2 text-foreground sm:mb-10 sm:text-center">
            Como funciona
          </h2>
          <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
            {STEPS.map(({ icon: Icon, title, desc }, index) => (
              <li key={title}>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[.08] text-primary"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-h3 font-semibold text-foreground">
                    <span className="sr-only">Passo {index + 1}: </span>
                    {title}
                  </h3>
                </div>
                <p className="mt-1.5 text-base text-muted-foreground">{desc}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Preço: um único cartão, vindo de OFFER (sem plano mensal antes do pagamento). */}
      <section id="precos" aria-labelledby="landing-precos" className="scroll-mt-16 bg-muted py-12 sm:py-20">
        <Container size="sm">
          <h2 id="landing-precos" className="mb-6 text-h2 text-foreground sm:mb-10 sm:text-center">
            Quanto custa
          </h2>
          <Card variant="elevated" data-testid="landing-offer" className="mx-auto max-w-md">
            <h3 className="text-h3 font-semibold text-foreground">Análise completa do seu caminho</h3>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span className="text-4xl font-bold text-foreground">{OFFER.priceLabel}</span>
              <span className="text-sm text-muted-foreground">
                pagamento único · acesso por {OFFER.accessDays} dias
              </span>
            </p>
            <ul className="mt-4 space-y-1.5">
              {OFFER.includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-base text-foreground">
                  <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              {OFFER.delivery}. Você só decide depois de ver o pré-resultado grátis.
              {OFFER.guarantee ? ` ${OFFER.guarantee}` : ''}
            </p>
            <Button asChild size="md" className="mt-5 w-full">
              <Link
                ref={pricingCtaRef}
                to="/quiz"
                data-testid="cta-pricing-onetime"
                onClick={() => trackCta('pricing')}
              >
                {QUIZ_CTA_LABEL}
              </Link>
            </Button>
          </Card>
        </Container>
      </section>

      <Testimonials />

      {/* Perguntas frequentes (objeções) */}
      <section
        id="perguntas-frequentes"
        aria-labelledby="landing-faq-title"
        className="scroll-mt-16 pt-12 sm:py-20"
      >
        <Container size="sm">
          <h2 id="landing-faq-title" className="mb-6 text-h2 text-foreground sm:text-center">
            Perguntas frequentes
          </h2>
          <Faq items={faqItems} />
        </Container>
        {/* CTA fixo do celular: o espaçador dele fecha esta seção (some na seção final). */}
        <MobileStickyCta
          anchorRef={heroCtaRef}
          inlineCtaRef={pricingCtaRef}
          endRef={finalRef}
          label={QUIZ_CTA_LABEL}
        />
      </section>

      {/* Seção final */}
      <section
        ref={finalRef}
        aria-labelledby="landing-final"
        className="bg-primary py-12 text-center text-primary-foreground sm:py-20"
      >
        <Container size="sm">
          <h2 id="landing-final" className="text-h2 text-primary-foreground">
            Descubra o seu caminho
          </h2>
          <p className="mt-2 text-base text-primary-foreground/90">{MICROCOPY}</p>
          <Button asChild variant="secondary" size="lg" className="mt-5 w-full border-transparent text-primary sm:w-auto">
            <Link to="/quiz" data-testid="cta-start-quiz-final" onClick={() => trackCta('final')}>
              {QUIZ_CTA_LABEL}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </Container>
      </section>
    </div>
  )
}
