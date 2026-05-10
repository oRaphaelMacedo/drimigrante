import { Link } from 'react-router-dom'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="container py-10">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <span className="text-lg font-bold text-brand-700">Doutor Imigrante</span>
            <p className="mt-2 max-w-xs text-sm text-gray-500">
              Análise jurídica personalizada para o seu processo de imigração para Portugal.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Serviços</h3>
            <ul className="space-y-2">
              <li><Link to="/quiz" className="text-sm text-gray-600 hover:text-brand-700">Quiz Gratuito</Link></li>
              <li><Link to="/#como-funciona" className="text-sm text-gray-600 hover:text-brand-700">Como Funciona</Link></li>
              <li><Link to="/#precos" className="text-sm text-gray-600 hover:text-brand-700">Preços</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Legal</h3>
            <ul className="space-y-2">
              <li><Link to="/termos" className="text-sm text-gray-600 hover:text-brand-700">Termos de Serviço</Link></li>
              <li><Link to="/privacidade" className="text-sm text-gray-600 hover:text-brand-700">Privacidade</Link></li>
              <li><Link to="/cookies" className="text-sm text-gray-600 hover:text-brand-700">Cookies</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          © {year} Doutor Imigrante. Todos os direitos reservados. |{' '}
          <span>A informação disponibilizada não constitui aconselhamento jurídico.</span>
        </div>
      </div>
    </footer>
  )
}
