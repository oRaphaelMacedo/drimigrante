// QuizCaptureForm.tsx — Lead capture before showing result
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Lock, Mail, Phone, User } from 'lucide-react'
import type { LeadInfo } from '@/hooks/useQuiz'

const schema = z.object({
  fullName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

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
  })

  const submit = (data: FormValues) => {
    onSubmit({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone || undefined,
    })
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-right-4 duration-300 space-y-6">
      {/* Header */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-brand-700">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100">
            🎯
          </div>
          <span className="text-sm font-semibold uppercase tracking-wider">Quase lá!</span>
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          Onde enviamos o seu resultado?
        </h2>
        <p className="text-sm text-gray-500">
          Introduza os seus dados para receber o resultado e guardar a sua análise.
        </p>
      </div>

      {/* Form */}
      <form id="quiz-capture-form" onSubmit={handleSubmit(submit)} className="space-y-4">
        {/* Full name */}
        <div>
          <label htmlFor="capture-name" className="mb-1.5 block text-sm font-medium text-gray-700">
            Nome completo *
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="capture-name"
              type="text"
              autoComplete="name"
              placeholder="Ex: Ana Silva"
              {...register('fullName')}
              className="w-full rounded-xl border-2 border-gray-200 bg-white py-3 pl-9 pr-4 text-sm text-gray-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          {errors.fullName && (
            <p className="mt-1 text-xs text-red-500">{errors.fullName.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="capture-email" className="mb-1.5 block text-sm font-medium text-gray-700">
            Email *
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="capture-email"
              type="email"
              autoComplete="email"
              placeholder="Ex: ana@email.com"
              {...register('email')}
              className="w-full rounded-xl border-2 border-gray-200 bg-white py-3 pl-9 pr-4 text-sm text-gray-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* Phone (optional) */}
        <div>
          <label htmlFor="capture-phone" className="mb-1.5 block text-sm font-medium text-gray-700">
            Telefone / WhatsApp{' '}
            <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="capture-phone"
              type="tel"
              autoComplete="tel"
              placeholder="Ex: +55 11 99999-9999"
              {...register('phone')}
              className="w-full rounded-xl border-2 border-gray-200 bg-white py-3 pl-9 pr-4 text-sm text-gray-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          id="quiz-submit-btn"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 py-3.5 text-base font-bold text-white shadow-md shadow-brand-200 transition-all hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              A calcular o seu perfil...
            </>
          ) : (
            <>
              Ver Meu Resultado Gratuito
              <span>→</span>
            </>
          )}
        </button>

        {/* Trust signal */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Lock className="h-3 w-3" />
          Os seus dados são confidenciais e nunca partilhados com terceiros.
        </div>
      </form>
    </div>
  )
}
