// SettingsPage.tsx — Day 7
import { useState, useEffect } from 'react'
import { User, Bell, Shield, Key, Loader2, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export function SettingsPage() {
  const { authUser, session } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security'>('profile')
  const [isSaving, setIsSaving] = useState(false)

  // Profile Form State
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  // Notifications Form State
  const [notifyUpdates, setNotifyUpdates] = useState(true)
  const [notifyOffers, setNotifyOffers] = useState(false)

  useEffect(() => {
    if (authUser?.profile) {
      setFullName(authUser.profile.full_name ?? '')
      setPhone(authUser.profile.phone ?? '')
      
      const prefs = authUser.profile.notification_preferences as Record<string, any>
      if (prefs) {
        setNotifyUpdates(prefs.process_updates ?? true)
        setNotifyOffers(prefs.offers ?? false)
      }
    }
  }, [authUser])

  const email = session?.user.email || 'user@example.com'

  const handleSaveProfile = async () => {
    if (!authUser?.profile) return
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', authUser.user.id)

      if (error) throw error
      toast.success('Perfil atualizado com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar perfil')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    if (!authUser?.profile) return
    setIsSaving(true)
    try {
      const newPrefs = {
        process_updates: notifyUpdates,
        offers: notifyOffers
      }
      
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_preferences: newPrefs,
          updated_at: new Date().toISOString()
        })
        .eq('id', authUser.user.id)

      if (error) throw error
      toast.success('Preferências atualizadas com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar preferências')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gira o seu perfil, preferências e segurança.
        </p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Sidebar Nav */}
        <nav className="flex w-full flex-col gap-1 md:w-64">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
              activeTab === 'profile'
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <User className="h-5 w-5" />
            Perfil Pessoal
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
              activeTab === 'notifications'
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Bell className="h-5 w-5" />
            Notificações
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
              activeTab === 'security'
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Shield className="h-5 w-5" />
            Segurança
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm animate-in fade-in duration-300">
              <h2 className="mb-6 text-lg font-bold text-gray-900">Informações Pessoais</h2>
              
              <div className="space-y-5">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    disabled
                    value={email}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-xs text-gray-400">O seu email de acesso não pode ser alterado diretamente.</p>
                </div>
                
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nome Completo</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="O seu nome completo"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500 transition-shadow outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Telemóvel / WhatsApp</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+351 912 345 678"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500 transition-shadow outline-none"
                  />
                </div>

                <div className="pt-4 flex justify-end border-t border-gray-100 mt-6">
                  <button 
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Guardar Alterações
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm animate-in fade-in duration-300">
              <h2 className="mb-6 text-lg font-bold text-gray-900">Preferências de Notificação</h2>
              
              <div className="space-y-4 divide-y divide-gray-50">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <p className="font-medium text-gray-900">Atualizações de Processo</p>
                    <p className="text-sm text-gray-500">Receba emails quando houver novidades no seu caso ou na sua análise.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input 
                      type="checkbox" 
                      className="peer sr-only" 
                      checked={notifyUpdates}
                      onChange={(e) => setNotifyUpdates(e.target.checked)}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-600 peer-checked:after:translate-x-full peer-checked:after:border-white rtl:peer-checked:after:-translate-x-full"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium text-gray-900">Novidades e Ofertas</p>
                    <p className="text-sm text-gray-500">Dicas sobre imigração, promoções e novos serviços do Doutor Imigrante.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input 
                      type="checkbox" 
                      className="peer sr-only" 
                      checked={notifyOffers}
                      onChange={(e) => setNotifyOffers(e.target.checked)}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-600 peer-checked:after:translate-x-full peer-checked:after:border-white rtl:peer-checked:after:-translate-x-full"></div>
                  </label>
                </div>

                <div className="pt-4 flex justify-end border-t border-gray-100 mt-6">
                  <button 
                    onClick={handleSaveNotifications}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Guardar Preferências
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm animate-in fade-in duration-300">
              <h2 className="mb-6 text-lg font-bold text-gray-900">Segurança</h2>
              <p className="mb-4 text-sm text-gray-500">Nós utilizamos Magic Links (acesso sem password) para a sua segurança. A sua conta está segura e associada unicamente ao seu email.</p>
              
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 mb-6">
                <div className="flex gap-3">
                  <Shield className="h-5 w-5 text-blue-600 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900 text-sm">Autenticação Segura</h3>
                    <p className="text-sm text-blue-700 mt-1">Sempre que precisar entrar, enviaremos um link seguro para o seu email. Não precisa de decorar nenhuma password.</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={async () => {
                  toast.success('Em breve: Gestão de sessões')
                }}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                <Key className="h-4 w-4" />
                Desconectar de outros dispositivos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
