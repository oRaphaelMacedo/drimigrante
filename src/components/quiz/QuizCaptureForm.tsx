// QuizCaptureForm.tsx — contato antes do resultado (DI-043).
//
// - Campos do DS (Input): 16px (sem zoom no iOS), rótulo ligado, erro com
//   aria-invalid/aria-describedby e role="alert".
// - noValidate + validação do Zod no toque (mode onTouched): só a nossa
//   mensagem aparece, nunca a bolha nativa do navegador.
// - Enter/"próximo" do teclado leva ao campo seguinte; no último, envia.
// - Opt-in de novidades desmarcado por padrão (vai em p_answers.marketing_opt_in).
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { ArrowRight, Lock, Target } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import type { LeadInfo } from '@/hooks/useQuiz'

/** Telefone opcional: se vier, só dígitos e separadores comuns, de 8 a 15 dígitos. */
function isValidPhone(value: string | undefined): boolean {
  if (!value) return true
  if (!/^[+\d][\d\s().-]*$/.test(value)) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= 8 && digits <= 15
}

const schema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Informe como podemos te chamar (pelo menos 2 letras).')
    .max(120, 'Use no máximo 120 caracteres.'),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o seu e-mail.')
    .email('Confira o e-mail: ele parece incompleto (ex.: nome@email.com).'),
  phone: z
    .string()
    .trim()
    .optional()
    .refine(isValidPhone, 'Confira o número: use o código do país e só números (ex.: +55 11 99999-9999).'),
  marketingOptIn: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export const CAPTURE_TITLE_ID = 'quiz-capture-title'

interface QuizCaptureFormProps {
  onSubmit: (leadInfo: LeadInfo) => void
  isSubmitting: boolean
}

export function QuizCaptureForm({ onSubmit, isSubmitting }: QuizCaptureFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { fullName: '', email: '', phone: '', marketingOptIn: false },
  })

  const submit = (data: FormValues) => {
    onSubmit({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone || undefined,
      marketingOptIn: data.marketingOptIn,
    })
  }

  /**
   * Enter num campo do meio vai para o próximo em vez de enviar o formulário.
   * Foco síncrono (dentro do gesto) para o teclado do iOS continuar aberto.
   */
  const focusOnEnter = (next: keyof FormValues) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    const target = event.currentTarget.form?.elements.namedItem(next)
    if (!(target instanceof HTMLInputElement)) return
    event.preventDefault()
    target.focus()
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-right-4 space-y-6 duration-300 motion-reduce:animate-none">
      <header>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-primary">
          <Target className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id={CAPTURE_TITLE_ID} className="text-h2 text-foreground">
          Falta pouco para ver o seu resultado
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Informe como podemos te chamar e o seu e-mail. O resultado aparece logo em seguida.
        </p>
      </header>

      <form
        id="quiz-capture-form"
        noValidate
        aria-labelledby={CAPTURE_TITLE_ID}
        onSubmit={handleSubmit(submit)}
        className="space-y-5"
      >
        <Input
          id="capture-name"
          label="Como podemos te chamar?"
          required
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Ex.: Ana Silva"
          error={errors.fullName?.message}
          onKeyDown={focusOnEnter('email')}
          {...register('fullName')}
        />

        <Input
          id="capture-email"
          label="E-mail"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="nome@email.com"
          error={errors.email?.message}
          onKeyDown={focusOnEnter('phone')}
          {...register('email')}
        />

        <Input
          id="capture-phone"
          label={
            <>
              WhatsApp <span className="font-normal text-muted-foreground">(opcional)</span>
            </>
          }
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="go"
          placeholder="+55 11 99999-9999"
          hint="Com o código do país."
          error={errors.phone?.message}
          {...register('phone')}
        />

        <label
          htmlFor="capture-marketing"
          className="flex min-h-11 cursor-pointer select-none items-start gap-3 py-1 text-sm leading-relaxed text-foreground"
        >
          <input
            id="capture-marketing"
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            {...register('marketingOptIn')}
          />
          <span>Quero receber por e-mail novidades e dicas sobre a nacionalidade portuguesa.</span>
        </label>

        <Button id="quiz-submit-btn" type="submit" size="lg" loading={isSubmitting} className="w-full">
          Ver meu resultado
          {!isSubmitting && <ArrowRight aria-hidden="true" />}
        </Button>

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Usamos seus dados para o seu diagnóstico.{' '}
            <Link
              to="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
            >
              Política de Privacidade
              <span className="sr-only"> (abre em nova aba)</span>
            </Link>
          </span>
        </p>
      </form>
    </div>
  )
}
