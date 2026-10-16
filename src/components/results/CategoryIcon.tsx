import { Compass, Sparkles, TrendingUp, type LucideIcon, type LucideProps } from 'lucide-react'
import { getCategoryPresentation, type CategoryIconName } from '@/lib/category'

/** Ícones do lucide-react para os nomes de CATEGORY_PRESENTATION (src/lib/category.ts). */
const CATEGORY_ICONS: Record<CategoryIconName, LucideIcon> = {
  sparkles: Sparkles,
  'trending-up': TrendingUp,
  compass: Compass,
}

export interface CategoryIconProps extends LucideProps {
  category: string
}

/** Ícone da categoria do resultado (decorativo: `aria-hidden`). */
export function CategoryIcon({ category, ...props }: CategoryIconProps) {
  const { icon } = getCategoryPresentation(category)
  const Icon = CATEGORY_ICONS[icon]
  return <Icon aria-hidden="true" data-icon={icon} {...props} />
}
