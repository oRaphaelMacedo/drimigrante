/**
 * Aba "Privacidade" da Conta (DI-083, LGPD/RGPD).
 *
 * - Baixar meus dados: JSON gerado pela Edge Function export-my-data.
 * - Outros direitos (corrigir, limitar, se opor): pelo e-mail de privacidade.
 * - Apagar minha conta: abre o DeleteAccountSheet (confirmação digitando o
 *   e-mail). Contas da equipe não aparecem com o botão: são removidas pelo
 *   administrador.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileJson, Mail, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DeleteAccountSheet } from '@/components/dashboard/DeleteAccountSheet'
import { Button, Card } from '@/components/ui'
import { PRIVACY_EMAIL, mailtoHref } from '@/config/contact'
import { useAuth } from '@/hooks/useAuth'
import { AccountPrivacyError, downloadFile, exportMyData } from '@/lib/account-privacy'

export function PrivacyPanel() {
  const { access, isStaffUser } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const isStaff = access.isStaff || isStaffUser

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const file = await exportMyData()
      downloadFile(file)
      toast.success('Arquivo pronto.', { description: `Procure por ${file.fileName} nos seus downloads.` })
    } catch (err) {
      toast.error(err instanceof AccountPrivacyError ? err.message : 'Não foi possível gerar o arquivo. Tente de novo.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="settings-privacy">
      <Card>
        <h2 className="text-lg font-semibold text-foreground">Baixar meus dados</h2>
        <div className="mt-3 flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[.08] text-primary"
          >
            <FileJson className="h-5 w-5" />
          </span>
          <p className="text-base text-foreground [text-wrap:pretty]">
            Um arquivo (JSON) com seu perfil, seu plano, seus diagnósticos e a análise, as conversas do chat IA, a
            lista dos documentos enviados, seus pagamentos e os e-mails que enviamos para você.
          </p>
        </div>
        <p className="mt-3 text-sm text-muted-foreground [text-wrap:pretty]">
          Os arquivos dos documentos você baixa na página{' '}
          <Link
            to="/dashboard/documents"
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            Documentos
          </Link>
          .
        </p>
        <Button
          variant="secondary"
          className="mt-5 w-full sm:w-auto"
          loading={exporting}
          onClick={() => void handleExport()}
          data-testid="privacy-export-btn"
        >
          <Download aria-hidden="true" />
          Baixar meus dados
        </Button>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-foreground">Seus outros direitos</h2>
        <p className="mt-2 text-base text-foreground [text-wrap:pretty]">
          Para corrigir algum dado, limitar ou se opor a um uso dos seus dados, escreva para o nosso contato de
          privacidade. Veja também a{' '}
          <Link
            to="/privacidade"
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            Política de Privacidade
          </Link>
          .
        </p>
        <a
          href={mailtoHref(PRIVACY_EMAIL, 'Pedido sobre meus dados')}
          className="mt-2 inline-flex min-h-11 items-center gap-2 break-all font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          <Mail aria-hidden="true" className="h-4 w-4 shrink-0" />
          {PRIVACY_EMAIL}
        </a>
      </Card>

      <Card className="border-destructive/30">
        <h2 className="text-lg font-semibold text-foreground">Apagar minha conta</h2>
        {isStaff ? (
          <p className="mt-2 text-base text-muted-foreground [text-wrap:pretty]" data-testid="privacy-staff-note">
            Contas da equipe não são apagadas por aqui. Peça ao administrador.
          </p>
        ) : (
          <>
            <p className="mt-2 text-base text-foreground [text-wrap:pretty]">
              Apaga seu perfil, seus diagnósticos, a análise, as conversas do chat IA e os documentos enviados. Não dá
              para desfazer.
            </p>
            <Button
              variant="secondary"
              aria-haspopup="dialog"
              className="mt-5 w-full border-destructive/40 text-destructive hover:bg-destructive/5 sm:w-auto"
              onClick={() => setSheetOpen(true)}
              data-testid="privacy-delete-open"
            >
              <Trash2 aria-hidden="true" />
              Apagar minha conta
            </Button>
            <DeleteAccountSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              onExport={() => void handleExport()}
              exportPending={exporting}
            />
          </>
        )}
      </Card>
    </div>
  )
}
