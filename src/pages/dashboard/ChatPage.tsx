import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Send, Bot, User, Loader2, ClipboardList, AlertCircle, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { UpsellSheet } from '@/components/dashboard/UpsellSheet'
import { upsellOfferFor } from '@/components/dashboard/dashboard-access'
import { MarkdownText } from '@/components/MarkdownText'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult, type ResultPathway } from '@/hooks/useAssessmentResult'
import {
  CHAT_MESSAGE_MAX_CHARS,
  describeChatSendError,
  useChatData,
  type ChatMessage,
} from '@/hooks/useChatData'
import { getChatSuggestions } from '@/lib/chat-suggestions'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/**
 * Chat IA no celular (DI-051).
 *
 * Altura: a tela inteira (dvh) menos o cabeçalho do celular (4rem + borda + safe-area),
 * a barra de navegação inferior (`--bottom-nav-h`, publicada pela BottomNav e
 * 0px quando ela some com o teclado aberto) e o banner de cookies, se aberto.
 * A rota do chat não tem o padding do <main> no celular (DashboardLayout).
 * No desktop: a tela menos o padding do <main>.
 */
const CHAT_HEIGHT =
  'h-[calc(100dvh-4rem-1px-env(safe-area-inset-top)-var(--bottom-nav-h,0px)-var(--cookie-banner-h,0px))] md:h-[calc(100dvh-3rem-var(--cookie-banner-h,0px))]'

/** Campo cresce até 5 linhas (leading-6 = 24px) + padding vertical (2 × 10px). */
const TEXTAREA_MAX_HEIGHT_PX = 5 * 24 + 20
/** Mostra o contador perto do limite do servidor. */
const COUNTER_FROM = CHAT_MESSAGE_MAX_CHARS - 200
/** Distância do fim (px) até a qual a conversa acompanha a resposta chegando. */
const STICK_TO_BOTTOM_PX = 80

const MATCH_ORDER: Record<ResultPathway['match'], number> = { strong: 0, possible: 1, weak: 2 }

function lengthBucket(length: number): string {
  if (length <= 50) return '0-50'
  if (length <= 200) return '51-200'
  return '200+'
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function scrollToBottom(el: HTMLElement | null, behavior: ScrollBehavior) {
  if (!el) return
  if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior })
  else el.scrollTop = el.scrollHeight
}

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function formatMessageTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  return sameDay ? timeFormat.format(date) : dateTimeFormat.format(date)
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
  content:
    'Olá! Sou o assistente com IA do Doutor Imigrante. Pergunte sobre o seu caminho para a nacionalidade portuguesa, os documentos e os próximos passos.',
  createdAt: new Date(),
}

function MessageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn('flex gap-3', i % 2 === 1 ? 'flex-row-reverse' : 'flex-row')}>
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className={cn('h-14 animate-pulse rounded-2xl bg-muted', i % 2 === 1 ? 'w-48' : 'w-64')} />
        </div>
      ))}
    </div>
  )
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" data-testid="chat-typing">
      <span className="sr-only">O assistente está escrevendo…</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  )
}

function MessageBubble({ msg }: { msg: LocalMessage }) {
  const isUser = msg.role === 'user'
  // A saudação não é uma mensagem gravada: sem horário.
  const time = msg.isStreaming || msg.id === WELCOME_MESSAGE.id ? '' : formatMessageTime(msg.createdAt)
  return (
    <div
      data-testid={isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}
      className={cn('flex gap-3 sm:gap-4', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div
        aria-hidden="true"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-muted text-muted-foreground' : 'bg-primary/[.08] text-primary',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'min-w-0 max-w-[85%] rounded-2xl px-3.5 py-3 text-base sm:max-w-[75%] sm:px-4',
          isUser ? 'bg-primary text-primary-foreground' : 'border bg-muted text-foreground',
        )}
      >
        <span className="sr-only">{isUser ? 'Você:' : 'Assistente:'}</span>
        {isUser ? (
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.content}</p>
        ) : msg.content ? (
          <MarkdownText minHeadingLevel={4} className="[overflow-wrap:anywhere]">
            {msg.content}
          </MarkdownText>
        ) : (
          <TypingIndicator />
        )}
        {msg.isStreaming && msg.content && (
          <span
            data-testid="chat-streaming-cursor"
            aria-hidden="true"
            className="mt-1 inline-block h-3 w-1.5 animate-pulse bg-primary align-middle"
          />
        )}
        {time && (
          <span
            className={cn(
              'mt-1.5 block text-xs',
              isUser ? 'text-right text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {time}
          </span>
        )}
      </div>
    </div>
  )
}

function SuggestionChips({
  suggestions,
  disabled,
  onPick,
}: {
  suggestions: string[]
  disabled: boolean
  onPick: (text: string) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="pl-11 sm:pl-12" data-testid="chat-suggestions">
      <p id="chat-suggestions-title" className="text-sm font-medium text-muted-foreground">
        Sugestões para começar
      </p>
      <ul aria-labelledby="chat-suggestions-title" className="mt-2 flex flex-col items-start gap-2">
        {suggestions.map((text) => (
          <li key={text} className="max-w-full">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(text)}
              className="min-h-11 rounded-xl border bg-card px-3.5 py-2 text-left text-sm font-medium text-primary shadow-[var(--shadow-sm)] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ChatPage() {
  const { hasAccess, access, refreshUser } = useAuth()
  const { result } = useAssessmentResult()
  const [upsellOpen, setUpsellOpen] = useState(false)
  const {
    assessment,
    isLoadingAssessment,
    messages: dbMessages,
    isLoadingMessages,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    sendMessage,
    isStreaming,
    streamingText,
    pendingUserMessage,
    sendError,
  } = useChatData()

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottomRef = useRef(true)
  const didInitialScrollRef = useRef(false)
  const prependAnchorRef = useRef<{ height: number; top: number; count: number } | null>(null)
  const hasChatAccess = hasAccess('chat')

  const topPathwayCode = useMemo(() => {
    const pathways = [...(result?.pathways ?? [])]
    pathways.sort((a, b) => (MATCH_ORDER[a.match] ?? 3) - (MATCH_ORDER[b.match] ?? 3))
    return pathways[0]?.code ?? null
  }, [result?.pathways])
  const suggestions = useMemo(() => getChatSuggestions(topPathwayCode), [topPathwayCode])

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
    displayMessages.push({ id: 'pending-user', role: 'user', content: pendingUserMessage, createdAt: new Date() })
  }
  if (isStreaming || streamingText) {
    displayMessages.push({
      id: 'streaming',
      role: 'assistant',
      content: streamingText,
      createdAt: new Date(),
      isStreaming,
    })
  }
  const lastMessageId = displayMessages[displayMessages.length - 1]?.id
  const showSuggestions =
    !isLoadingMessages && dbMessages.length === 0 && !pendingUserMessage && !isStreaming && !streamingText
  const chatVisible = hasChatAccess && !isLoadingAssessment && !!assessment

  // Campo cresce com o texto até 5 linhas; depois rola por dentro.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const height = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)
    if (height > 0) el.style.height = `${height}px`
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden'
    // O campo maior encolhe a conversa: quem estava no fim continua vendo a última mensagem.
    const log = scrollRef.current
    if (log && stickToBottomRef.current) log.scrollTop = log.scrollHeight
  }, [input, chatVisible])

  // Primeira carga: abre no fim da conversa (a mensagem mais recente), sem animação.
  useLayoutEffect(() => {
    if (!chatVisible || isLoadingMessages || didInitialScrollRef.current) return
    const el = scrollRef.current
    if (!el) return
    didInitialScrollRef.current = true
    el.scrollTop = el.scrollHeight
  }, [chatVisible, isLoadingMessages])

  // "Carregar anteriores": mantém na tela a mensagem que a pessoa estava lendo.
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current
    const el = scrollRef.current
    if (!anchor || !el || dbMessages.length <= anchor.count) return
    prependAnchorRef.current = null
    el.scrollTop = el.scrollHeight - anchor.height + anchor.top
  }, [dbMessages.length])

  // Pergunta enviada: sempre leva ao fim.
  useEffect(() => {
    if (!pendingUserMessage) return
    stickToBottomRef.current = true
    scrollToBottom(scrollRef.current, prefersReducedMotion() ? 'auto' : 'smooth')
  }, [pendingUserMessage])

  // Resposta chegando ou mensagem nova: acompanha só se a pessoa está no fim
  // (rolagem 'auto' durante o streaming, para não brigar com a animação).
  useEffect(() => {
    if (!stickToBottomRef.current || prependAnchorRef.current) return
    scrollToBottom(scrollRef.current, isStreaming || prefersReducedMotion() ? 'auto' : 'smooth')
  }, [lastMessageId, streamingText, isStreaming])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX
  }

  const handleLoadOlder = async () => {
    const el = scrollRef.current
    if (el) prependAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop, count: dbMessages.length }
    const loaded = await loadOlderMessages().catch(() => false)
    if (!loaded) prependAnchorRef.current = null
  }

  const handleSend = async (text: string, fromSuggestion = false) => {
    const message = text.trim()
    if (!message || !hasChatAccess || isStreaming || message.length > CHAT_MESSAGE_MAX_CHARS) return
    if (!fromSuggestion) setInput('')
    track('chat_message_sent', { length_bucket: lengthBucket(message.length), from_suggestion: fromSuggestion })
    const outcome = await sendMessage(message)
    if (outcome.ok) return
    // Nada se perde: a mensagem volta para o campo (antes de um rascunho novo, se houver).
    setInput((current) =>
      current.trim() ? `${message}\n${current}`.slice(0, CHAT_MESSAGE_MAX_CHARS) : message,
    )
    if (outcome.error.kind === 'no_access') void refreshUser()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handleSend(input)
    }
  }

  // Normalmente o ProtectedRoute já levou quem não tem chat para a oferta no
  // Início (/dashboard?upsell=chat). Se o acesso mudar com a página aberta (o
  // prazo acabou, por exemplo), a oferta aparece aqui mesmo — sem redirecionar.
  if (!hasChatAccess) {
    const offer = upsellOfferFor(access)
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-8 text-center">
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
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-8 text-center">
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

  const canSend = !!input.trim() && !isStreaming
  const showCounter = input.length >= COUNTER_FROM

  return (
    <div
      data-testid="chat-panel"
      className={cn(
        'flex flex-col overflow-hidden bg-card md:rounded-lg md:border md:shadow-[var(--shadow-sm)]',
        CHAT_HEIGHT,
      )}
    >
      <div className="flex items-center gap-3 border-b px-4 py-2.5 sm:p-4">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[.08] text-primary sm:h-10 sm:w-10"
        >
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-snug text-foreground">Assistente IA</h1>
          <p className="text-sm text-muted-foreground">Respostas com base no seu diagnóstico</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="chat-scroll"
        // relative: os textos sr-only (position: absolute) ficam presos aqui; sem isso eles
        // escapam do overflow e a PÁGINA inteira passa a rolar junto com a conversa.
        className="relative flex-1 overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] sm:p-6"
      >
        <div className="space-y-5 sm:space-y-6">
          {hasOlderMessages && !isLoadingMessages && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                loading={isLoadingOlderMessages}
                onClick={() => void handleLoadOlder()}
              >
                Carregar mensagens anteriores
              </Button>
            </div>
          )}

          <div
            role="log"
            aria-label="Conversa com o assistente"
            aria-busy={isStreaming || isLoadingMessages}
            className="space-y-5 sm:space-y-6"
          >
            {isLoadingMessages ? (
              <MessageSkeleton />
            ) : (
              displayMessages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
            )}
          </div>

          {showSuggestions && (
            <SuggestionChips suggestions={suggestions} disabled={isStreaming} onPick={(text) => void handleSend(text, true)} />
          )}

          {sendError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[.06] p-3 text-sm text-destructive"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p>{describeChatSendError(sendError)}</p>
                {sendError.kind === 'auth' && (
                  <Link
                    to={`/login?next=${encodeURIComponent('/dashboard/chat')}`}
                    className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
                  >
                    Entrar de novo
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/*
        Campo fixo no fim do painel. A safe-area de baixo só entra quando nada a cobre:
        com a barra inferior visível ela já cuida disso, e com o campo focado o
        teclado cobre a borda (sem o vão de ~34px acima do teclado no iPhone).
      */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend(input)
        }}
        className="border-t bg-card px-3 pb-3 pt-3 sm:px-4 [&:not(:focus-within)]:pb-[max(.75rem,calc(env(safe-area-inset-bottom)-var(--bottom-nav-h,0px)))]"
      >
        <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-1.5 shadow-[var(--shadow-sm)] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <textarea
            ref={textareaRef}
            data-testid="chat-input"
            aria-label="Mensagem para o assistente"
            aria-describedby={showCounter ? 'chat-disclaimer chat-counter' : 'chat-disclaimer'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua pergunta…"
            maxLength={CHAT_MESSAGE_MAX_CHARS}
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-11 w-full resize-none bg-transparent py-2.5 pl-3 pr-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground"
            rows={1}
          />
          <button
            type="submit"
            data-testid="chat-send"
            aria-label="Enviar mensagem"
            aria-busy={isStreaming || undefined}
            disabled={!canSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {isStreaming ? (
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <p id="chat-disclaimer" className="text-xs text-muted-foreground [text-wrap:pretty]">
            A IA pode errar. Confira as informações importantes nas fontes oficiais.
          </p>
          {showCounter && (
            <p
              id="chat-counter"
              aria-live="polite"
              className={cn(
                'shrink-0 text-xs tabular-nums',
                input.length >= CHAT_MESSAGE_MAX_CHARS ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {input.length.toLocaleString('pt-BR')}/{CHAT_MESSAGE_MAX_CHARS.toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
