import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export function ChatPage() {
  const { authUser, hasAccess } = useAuth()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Olá! Sou o assistente virtual do Doutor Imigrante. Como posso ajudar com o seu processo de imigração hoje?',
      createdAt: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const hasChatAccess = hasAccess('chat')

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !hasChatAccess || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      // Obter o assessment atual (se existir) para contexto (usando localStorage por enquanto como no Dashboard)
      let assessmentId = ''
      try {
        const raw = localStorage.getItem('dr_imigrante_quiz_result')
        if (raw) {
          const parsed = JSON.parse(raw)
          assessmentId = parsed.assessmentId ?? ''
        }
      } catch {
        // ignore
      }

      // Prepare history excluding the welcome message and current message
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }))

      const { data, error } = await supabase.functions.invoke('chat-completion', {
        body: {
          message: userMsg.content,
          user_id: authUser?.user.id,
          assessment_id: assessmentId,
          history,
        },
      })

      if (error) throw new Error(error.message)

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content || 'Desculpe, ocorreu um erro ao processar a resposta.',
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      console.error('Chat error:', err)
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro de comunicação. Por favor, tente novamente.',
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

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
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-4',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  msg.role === 'user'
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-brand-100 text-brand-700'
                )}
              >
                {msg.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl p-4 text-sm sm:max-w-[75%]',
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-50 text-gray-800 border border-gray-100'
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <span
                  className={cn(
                    'mt-2 block text-[10px]',
                    msg.role === 'user' ? 'text-brand-200 text-right' : 'text-gray-400'
                  )}
                >
                  {msg.createdAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                A processar resposta...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-100 p-4">
        <div className="relative flex items-end gap-2 rounded-2xl border border-gray-300 bg-white p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva a sua mensagem..."
            className="max-h-32 min-h-[44px] w-full resize-none bg-transparent py-2.5 pl-3 pr-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {isLoading ? (
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
