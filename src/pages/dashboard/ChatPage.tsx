import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, ClipboardList, AlertCircle, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { UpsellSheet } from '@/components/dashboard/UpsellSheet'
import { upsellOfferFor } from '@/components/dashboard/dashboard-access'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult } from '@/hooks/useAssessmentResult'
import { useChatData, type ChatMessage } from '@/hooks/useChatData'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/**
 * Altura da área do chat: a tela inteira menos o cabeçalho do celular (4rem +
 * safe-area), o respiro do <main> (1rem em cima, 5rem + safe-area embaixo, que
 * cobrem a barra de navegação inferior) e o banner de cookies, se aberto
 * (DashboardLayout). No desktop, só o padding do <main>.
 */
const CHAT_HEIGHT =
  'h-[calc(100dvh-10rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--cookie-banner-h,0px))] md:h-[calc(100dvh-3rem)]'

/** Mensagem de erro sem detalhes técnicos. */
function friendlySendError(error: Error): string {
  const message = error.message || ''
  if (/não autenticado|\b401\b/i.test(message)) return 'Sua sessão expirou. Entre de novo para continuar.'
  if (/\b403\b/.test(message)) return 'O chat não está liberado na sua conta agora.'
  if (/\b429\b/.test(message)) return 'Muitas mensagens em pouco tempo. Aguarde um pouco e tente de novo.'
  if (/failed to fetch|network|load failed/i.test(message)) return 'Sem conexão. Verifique sua internet e tente de novo.'
  return 'Não foi possível enviar sua mensagem. Tente de novo.'
}

function lengthBucket(length: number): string {
  if (length <= 50) return '0-50'
  if (length <= 200) return '51-200'
  return '200+'
}

interface LocalMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  isStreaming?: boolean
}

const WELCOME_MESSAGE: LocalMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Sou o assistente virtual do Doutor Imigrante. Como posso ajudar no seu processo hoje?',
  createdAt: new Date(),
}

function MessageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn('flex gap-4', i % 2 === 1 ? 'flex-row-reverse' : 'flex-row')}>
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className={cn('h-14 animate-pulse rounded-2xl bg-muted', i % 2 === 1 ? 'w-48' : 'w-64')} />
        </div>
      ))}
    </div>
  )
}

function MessageBubble({ msg }: { msg: LocalMessage }) {
  return (
    <div
      data-testid={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}
      className={cn('flex gap-3 sm:gap-4', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
    >
      <div
        aria-hidden="true"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          msg.role === 'user' ? 'bg-muted text-muted-foreground' : 'bg-primary/[.08] text-primary',
        )}
      >
        {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl p-3.5 text-base sm:max-w-[75%] sm:p-4',
          msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted text-foreground',
        )}
      >
        <span className="sr-only">{msg.role === 'user' ? 'Você:' : 'Assistente:'}</span>
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {msg.content}
          {msg.isStreaming && (
            <span
              data-testid="chat-streaming-cursor"
              aria-hidden="true"
              className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary align-middle"
            />
          )}
        </p>
        <span
          className={cn(
            'mt-2 block text-xs',
            msg.role === 'user' ? 'text-right text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {msg.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

export function ChatPage() {
  const { hasAccess, access } = useAuth()
  const { result } = useAssessmentResult()
  const [upsellOpen, setUpsellOpen] = useState(false)
  const {
    assessment,
    isLoadingAssessment,
    messages: dbMessages,
    isLoadingMessages,
    sendMessage,
    isStreaming,
    streamingText,
    pendingUserMessage,
    sendError,
  } = useChatData()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasChatAccess = hasAccess('chat')

  const baseMessages: LocalMessage[] =
    dbMessages.length > 0
      ? (dbMessages as ChatMessage[]).map((m) => ({
          id: m.id,
          role: m.role === 'system' ? 'assistant' : m.role,
          content: m.content,
          createdAt: new Date(m.created_at),
        }))
      : [WELCOME_MESSAGE]

  const displayMessages: LocalMessage[] = [...baseMessages]
  if (pendingUserMessage) {
    displayMessages.push({
      id: 'pending-user',
      role: 'user',
      content: pendingUserMessage,
      createdAt: new Date(),
    })
  }
  if (isStreaming) {
    displayMessages.push({
      id: 'streaming',
      role: 'assistant',
      content: streamingText || '…',
      createdAt: new Date(),
      isStreaming: true,
    })
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [dbMessages, streamingText, pendingUserMessage])

  const handleSend = async () => {
    if (!input.trim() || !hasChatAccess || isStreaming) return
    const message = input.trim()
    setInput('')
    track('chat_message_sent', { length_bucket: lengthBucket(message.length) })
    await sendMessage(message)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Normalmente o ProtectedRoute já levou quem não tem chat para a oferta no
  // Início (/dashboard?upsell=chat). Se o acesso mudar com a página aberta (o
  // prazo acabou, por exemplo), a oferta aparece aqui mesmo — sem redirecionar.
  if (!hasChatAccess) {
    const offer = upsellOfferFor(access)
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-2 text-center">
        <span
          aria-hidden="true"
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
        >
          <Lock className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-semibold text-foreground [text-wrap:balance]">O chat IA não está liberado</h1>
        <p className="mt-2 max-w-sm text-base text-muted-foreground [text-wrap:pretty]">
          {offer === 'one_time'
            ? 'O chat faz parte da análise completa.'
            : offer === 'recurring'
              ? 'Com a assinatura mensal, o chat fica disponível enquanto ela estiver ativa.'
              : 'Se você acha que isto é um erro, fale com o suporte.'}
        </p>
        {offer ? (
          <Button
            variant={offer === 'one_time' ? 'pay' : 'primary'}
            className="mt-6 w-full max-w-xs"
            aria-haspopup="dialog"
            onClick={() => setUpsellOpen(true)}
          >
            Ver como liberar
          </Button>
        ) : (
          <Button asChild variant="secondary" className="mt-6 w-full max-w-xs">
            <Link to="/dashboard">Voltar ao início</Link>
          </Button>
        )}
        <UpsellSheet
          open={upsellOpen}
          onOpenChange={setUpsellOpen}
          reason="chat"
          access={access}
          assessmentId={result?.assessmentId || null}
          hasQuizResult={!!result}
        />
      </div>
    )
  }

  if (isLoadingAssessment) {
    return (
      <div role="status" className={cn('flex flex-col items-center justify-center gap-3', CHAT_HEIGHT)}>
        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-primary" />
        <p className="text-base text-muted-foreground">Carregando seu diagnóstico…</p>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-2 text-center">
        <ClipboardList aria-hidden="true" className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground [text-wrap:balance]">Sem diagnóstico disponível</h1>
        <p className="mt-2 max-w-sm text-base text-muted-foreground [text-wrap:pretty]">
          Para usar o chat, conclua primeiro o diagnóstico gratuito.
        </p>
        <Button asChild className="mt-6 w-full max-w-xs">
          <Link to="/quiz">Fazer o diagnóstico</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-sm)]', CHAT_HEIGHT)}>
      <div className="flex items-center gap-3 border-b p-3 sm:p-4">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/[.08] text-primary"
        >
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-foreground">Assistente IA</h1>
          <p className="text-sm text-muted-foreground">Respostas com base no seu diagnóstico</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6" aria-busy={isStreaming}>
        <div className="space-y-5 sm:space-y-6">
          {isLoadingMessages ? (
            <MessageSkeleton />
          ) : (
            displayMessages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}

          {sendError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[.06] p-3 text-sm text-destructive"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{friendlySendError(sendError)}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t p-3 sm:p-4">
        <div className="relative flex items-end gap-2 rounded-2xl border border-input bg-card p-1.5 shadow-[var(--shadow-sm)] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <textarea
            data-testid="chat-input"
            aria-label="Mensagem para o assistente"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua mensagem…"
            disabled={isStreaming}
            enterKeyHint="send"
            className="max-h-32 min-h-11 w-full resize-none bg-transparent py-2.5 pl-3 pr-2 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            rows={1}
          />
          <button
            type="button"
            data-testid="chat-send"
            aria-label="Enviar mensagem"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {isStreaming ? (
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          A IA pode errar. Confira as informações importantes nas fontes oficiais.
        </p>
      </div>
    </div>
  )
}
