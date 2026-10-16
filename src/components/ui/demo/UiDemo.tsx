// Página de demonstração dos componentes base (somente desenvolvimento).
// Serve como teste visual e de render: http://localhost:<porta>/src/components/ui/demo/ui-demo.html
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Clock, Lock } from 'lucide-react'
import { CookieBanner } from '@/components/CookieBanner'
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  Input,
  Select,
  StickyCTA,
  Textarea,
} from '@/components/ui'

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section className="space-y-4 py-8" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function UiDemo() {
  const heroRef = useRef<HTMLElement>(null)
  const inlineCtaRef = useRef<HTMLButtonElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const demoWindow = window as unknown as { __uiDemoReady?: boolean }
    demoWindow.__uiDemoReady = true
  }, [])

  const emailError = submitted && !email.includes('@') ? 'Informe um e-mail válido.' : undefined

  return (
    <div className="min-h-[100dvh] bg-background">
      <header
        ref={heroRef}
        className="border-b bg-primary px-4 py-10 text-primary-foreground sm:py-16"
        data-testid="demo-hero"
      >
        <Container size="sm" className="px-0 sm:px-0">
          <p className="text-sm font-medium opacity-90">Somente desenvolvimento</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight [text-wrap:balance]">Componentes base</h1>
          <p className="mt-3 max-w-prose opacity-90">
            Botões, cartões, campos, etiquetas, sheet e barra fixa com tokens semânticos.
          </p>
        </Container>
      </header>

      <Container size="sm">
        <Section title="Botões">
          <div className="flex flex-col gap-3">
            <Button className="w-full">
              Começar diagnóstico <ArrowRight aria-hidden="true" />
            </Button>
            <Button variant="pay" size="lg" className="w-full">
              <Lock aria-hidden="true" /> Desbloquear análise — €30
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary">Secundário</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Discreto</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Pequeno</Button>
              <Button size="md">Médio</Button>
              <Button size="icon" variant="secondary" aria-label="Lembrete">
                <Clock />
              </Button>
              <Button variant="destructive" size="sm">
                Apagar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                loading={loading}
                onClick={() => {
                  setLoading(true)
                  window.setTimeout(() => setLoading(false), 1500)
                }}
                data-testid="demo-loading"
              >
                {loading ? 'Processando…' : 'Testar carregamento'}
              </Button>
              <Button disabled>Desabilitado</Button>
              <Button asChild variant="secondary">
                <Link to="/login">Link como botão</Link>
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Etiquetas">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutra</Badge>
            <Badge variant="primary">Em análise</Badge>
            <Badge variant="success">
              <CheckCircle2 aria-hidden="true" /> Acesso ativo
            </Badge>
            <Badge variant="warning">Expira em 3 dias</Badge>
            <Badge variant="danger">Expirado</Badge>
            <Badge variant="outline" size="sm">
              Pequena
            </Badge>
          </div>
        </Section>

        <Section title="Cartões">
          <Card>
            <CardHeader>
              <CardTitle>Cartão padrão</CardTitle>
              <CardDescription>Fundo branco, borda e sombra leve. Respiro de 20px no celular.</CardDescription>
            </CardHeader>
            <p className="text-foreground">Conteúdo do cartão.</p>
            <CardFooter>
              <Button variant="secondary" className="w-full sm:w-auto">
                Ação do cartão
              </Button>
            </CardFooter>
          </Card>
          <Card variant="elevated">
            <CardTitle>Cartão em destaque</CardTitle>
            <CardDescription className="mt-1">Sombra tingida da marca.</CardDescription>
          </Card>
          <Card variant="muted">
            <CardDescription>Bloco secundário sobre fundo muted.</CardDescription>
          </Card>
        </Section>

        <Section title="Campos">
          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              setSubmitted(true)
            }}
          >
            <Input label="Nome" autoComplete="name" placeholder="Como devemos chamar você" />
            <Input
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              hint="Usado só para enviar o seu resultado."
              error={emailError}
              data-testid="demo-email"
            />
            <Select label="País de nascimento" placeholder="Selecione" defaultValue="">
              <option value="BR">Brasil</option>
              <option value="PT">Portugal</option>
              <option value="AO">Angola</option>
            </Select>
            <Textarea label="Observações" hint="Opcional." rows={3} />
            <Input label="Campo desabilitado" disabled defaultValue="Não editável" />
            <Button type="submit" className="w-full" data-testid="demo-submit">
              Validar formulário
            </Button>
          </form>
        </Section>

        <Section title="Sheet">
          <BottomSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="O que está incluído"
            description="Exemplo de conteúdo em um painel que sobe de baixo."
            trigger={
              <Button variant="secondary" className="w-full" data-testid="demo-open-sheet">
                Abrir sheet
              </Button>
            }
            footer={
              <Button variant="pay" size="lg" className="w-full" onClick={() => setSheetOpen(false)}>
                Continuar
              </Button>
            }
          >
            <ul className="space-y-3 text-foreground">
              {['Análise do seu caminho', 'Requisitos e documentos', 'Próximos passos'].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </BottomSheet>
        </Section>

        <Section title="Conteúdo longo">
          {Array.from({ length: 6 }, (_, i) => (
            <p key={i} className="leading-relaxed text-muted-foreground">
              Parágrafo de preenchimento {i + 1} para testar a rolagem, a barra fixa e o espaçador no fim da
              página.
            </p>
          ))}
          <Button ref={inlineCtaRef} variant="pay" size="lg" className="w-full" data-testid="demo-inline-cta">
            CTA inline (a barra fixa some quando este aparece)
          </Button>
        </Section>
      </Container>

      <StickyCTA anchorRef={heroRef} inlineCtaRef={inlineCtaRef}>
        <Button variant="pay" size="lg" className="w-full">
          Desbloquear análise — €30
        </Button>
      </StickyCTA>
      <CookieBanner />
    </div>
  )
}
