/**
 * Componentes base de UI (direção "Azulejo").
 *
 * Usam só tokens semânticos (primary, accent, muted, card, border…) definidos em
 * src/index.css, para que a identidade visual possa mudar sem tocar nos componentes.
 * Demonstração em desenvolvimento: /src/components/ui/demo/ui-demo.html (não entra no build).
 */
export { Button, buttonVariants, type ButtonProps } from './Button'
export { Card, CardHeader, CardTitle, CardDescription, CardFooter, type CardProps, type CardTitleProps } from './Card'
export { Input, type InputProps } from './Input'
export { Select, type SelectProps } from './Select'
export { Textarea, type TextareaProps } from './Textarea'
export { type FieldBaseProps } from './Field'
export { Badge, badgeVariants, type BadgeProps } from './Badge'
export { BottomSheet, type BottomSheetProps } from './BottomSheet'
export { StickyCTA, type StickyCTAProps } from './StickyCTA'
export { Container, type ContainerProps } from './Container'
