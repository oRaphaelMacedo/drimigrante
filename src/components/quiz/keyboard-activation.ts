// keyboard-activation.ts — o clique de um botão veio do teclado ou do dedo/mouse?
//
// A proteção contra "toque fantasma" do quiz (DI-039) só faz sentido para dedo
// e mouse. Enter/Espaço disparam o clique sem pointerdown antes; um toque ou
// clique sempre passa por pointerdown. Sem nenhum dos dois (ex.: clique
// programático), vale como toque — o caso mais conservador.
import { useCallback, useRef } from 'react'
import type * as React from 'react'

export function useKeyboardActivation() {
  const keyboardRef = useRef(false)

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    keyboardRef.current = event.key === 'Enter' || event.key === ' '
  }, [])

  const onPointerDown = useCallback(() => {
    keyboardRef.current = false
  }, [])

  /** Lê e zera: true se o clique atual veio do Enter/Espaço. */
  const consumeKeyboard = useCallback(() => {
    const value = keyboardRef.current
    keyboardRef.current = false
    return value
  }, [])

  return { onKeyDown, onPointerDown, consumeKeyboard }
}
