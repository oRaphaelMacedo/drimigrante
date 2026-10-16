import { cn } from '@/lib/utils'

/** Item de menu Radix com 44px de altura (alvo de toque) e destaque em muted. */
export const adminMenuItemClass = cn(
  'flex min-h-11 w-full cursor-default select-none items-center gap-2 rounded-lg px-3 text-sm text-foreground outline-none',
  'data-[highlighted]:bg-muted data-[disabled]:opacity-50',
)

/** Painel do menu suspenso (popover: acima do header, abaixo dos sheets). */
export const adminMenuContentClass = 'z-50 min-w-[14rem] rounded-xl border bg-popover p-1 text-popover-foreground shadow-md'
