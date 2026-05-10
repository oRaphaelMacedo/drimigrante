import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center p-4">
      <h1 className="mb-2 text-6xl font-extrabold text-brand-700">404</h1>
      <p className="mb-6 text-xl text-gray-600">Página não encontrada</p>
      <Link to="/" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
        Voltar ao início
      </Link>
    </div>
  )
}
