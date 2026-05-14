import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, ArrowLeft, ClipboardList, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useChatData, type ChatMessage } from '@/hooks/useChatData'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LocalMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

const WELCOME_MESSAGE: LocalMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Olá! Sou o assistente virtual do Doutor Imigrante. Como posso ajudar com o seu processo de imigração hoje?',
  createdAt: new Date(),
}

// ─── Skeleton loader for message history ─────────────────────────────────────

function MessageSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn('flex gap-4', i % 2 === 1 ? 'flex-row-reverse' : 'flex-row')}>
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
          <div
            className={cn(
              'h-14 animate-pulse rounded-2xl bg-gray-100',
              i % 2 === 1 ? 'w-48' : 'w-64',
            )}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: LocalMessage }) {
  return (
    <div
      data-testid={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}
      className={cn('flex gap-4', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          msg.role === 'user' ? 'bg-gray-100 text-gray-600' : 'bg-brand-100 text-brand-700',
        )}
      >
        {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl p-4 text-sm sm:max-w-[75%]',
          msg.role === 'user'
            ? 'bg-brand-600 text-white'
            : 'border border-gray-100 bg-gray-50 text-gray-800',
        )}
      >
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <span
          className={cn(
            'mt-2 block text-[10px]',
            msg.role === 'user' ? 'text-right text-brand-200' : 'text-gray-400',
          )}
        >
          {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ChatPage() {
  const { hasAccess } = useAuth()
  const { assessment, isLoadingAssessment, messages: dbMessages, isLoadingMessages, sendMessage } =
    useChatData()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const hasChatAccess = hasAccess('chat')

  // Convert DB messages to LocalMessage format; fall back to welcome message when empty
  const displayMessages: LocalMessage[] =
    dbMessages.length > 0
      ? (dbMessages as ChatMessage[]).map((m) => ({
          id: m.id,
          role: m.role === 'system' ? 'assistant' : m.role,
          content: m.content,
          createdAt: new Date(m.created_at),
        }))
      : [WELCOME_MESSAGE]

  // Auto-scroll to bottom whenever messages change (TASK-012)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dbMessages])

  const handleSend = async () => {
    if (!input.trim() || !hasChatAccess || sendMessage.isPending) return
    const message = input.trim()
    setInput('')
    sendMessage.mutate(message)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Guard: no subscription / chat access ──────────────────────────────────
  if (!hasChatAccess) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
        <Bot className="h-16 w-16 text-gray-300" />
        <h2 className="text-xl font-bold text-gray-700">Acesso Restrito</h2>
        <p className="text-center text-gray-500">
          O Chat IA é exclusivo para utilizadores com assinatura ativa.
        </p>
        <Link
          to="/dashboard"
          className="mt-4 flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Dashboard
        </Link>
      </div>
    )
  }

  // ── State: loading assessment ─────────────────────────────────────────────
  if (isLoadingAssessment) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <p className="text-sm text-gray-500">A carregar o seu perfil…</p>
      </div>
    )
  }

  // ── State: no assessment found — CTA to /quiz ─────────────────────────────
  if (!assessment) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
        <ClipboardList className="h-16 w-16 text-gray-300" />
        <h2 className="text-xl font-bold text-gray-700">Sem diagnóstico disponível</h2>
        <p className="text-center text-gray-500 max-w-sm">
          Para usar o chat, precisa primeiro de completar o questionário de diagnóstico.
        </p>
        <Link
          to="/quiz"
          className="mt-4 flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
        >
          Fazer o diagnóstico
        </Link>
      </div>
    )
  }

  // ── Main chat UI ──────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-gray-900">Assistente IA</h1>
          <p className="text-xs text-gray-500">Respostas rápidas baseadas no seu perfil</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-6">
          {isLoadingMessages ? (
            <MessageSkeleton />
          ) : (
            displayMessages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}

          {/* Sending indicator — non-streaming proxy for the "streaming cursor" */}
          {sendMessage.isPending && (
            <div data-testid="chat-streaming-cursor" className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                A processar resposta…
              </div>
            </div>
          )}

          {/* Inline send error */}
          {sendMessage.isError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {(sendMessage.error as Error)?.message ||
                  'Ocorreu um erro ao enviar a mensagem. Por favor, tente novamente.'}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-100 p-4">
        <div className="relative flex items-end gap-2 rounded-2xl border border-gray-300 bg-white p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
          <textarea
            data-testid="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva a sua mensagem…"
            disabled={sendMessage.isPending}
            className="max-h-32 min-h-[44px] w-full resize-none bg-transparent py-2.5 pl-3 pr-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50"
            rows={1}
          />
          <button
            data-testid="chat-send"
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          A IA pode cometer erros. Considere verificar informações importantes.
        </p>
      </div>
    </div>
  )
}
