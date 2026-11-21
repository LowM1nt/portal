import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { reduzirMovimento } from './preferencias.ts'
import { DURACAO_VARREDURA, TransicaoContexto } from './transicao.ts'

/** Varredura de luz do canto superior direito ao inferior esquerdo, por cima da troca login → casca. */
export function TransicaoProvider({ children }: { children: ReactNode }) {
  const [varrendo, setVarrendo] = useState(0)
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const disparar = useCallback(() => {
    if (reduzirMovimento()) return
    setVarrendo((n) => n + 1)
    clearTimeout(relogio.current)
    relogio.current = setTimeout(() => setVarrendo(0), DURACAO_VARREDURA)
  }, [])

  useEffect(() => () => clearTimeout(relogio.current), [])

  return (
    <TransicaoContexto.Provider value={disparar}>
      {children}
      {varrendo > 0 && (
        <div key={varrendo} className="varredura" aria-hidden="true" data-testid="varredura">
          <i />
        </div>
      )}
    </TransicaoContexto.Provider>
  )
}
