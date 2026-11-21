import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconeAlerta, IconeX } from './icones.tsx'

type Props = {
  titulo: string
  texto: ReactNode
  /** Verbo da ação ("Sim, pausar"). */
  acao: string
  /** Botão que desiste ("Cancelar"). */
  voltar?: string
  perigo?: boolean
  icone?: ReactNode
  ocupado?: boolean
  aoConfirmar: () => void
  aoFechar: () => void
}

/**
 * Modal central de confirmação: véu, ícone, título, frase e os botões à direita (fantasma + ação).
 * O foco começa em "Cancelar" (o caminho seguro), fica preso no modal e Esc fecha.
 */
export function Confirmar({ titulo, texto, acao, voltar = 'Cancelar', perigo = false, icone, ocupado = false, aoConfirmar, aoFechar }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const seguro = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    seguro.current?.focus()
  }, [])

  function teclado(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (!ocupado) aoFechar()
      return
    }
    if (e.key !== 'Tab' || !caixa.current) return
    const focaveis = [...caixa.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
    if (focaveis.length === 0) {
      e.preventDefault()
      return
    }
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  return createPortal(
    <>
      <div className="veu" aria-hidden="true" onClick={() => !ocupado && aoFechar()} />
      <div
        ref={caixa}
        className={`modal${perigo ? ' modal-perigo' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-texto`}
        onKeyDown={teclado}
      >
        <button type="button" className="botao-fechar" aria-label="Fechar" disabled={ocupado} onClick={aoFechar}>
          <IconeX />
        </button>
        <span className="modal-icone">{icone ?? <IconeAlerta />}</span>
        <h2 id={`${id}-titulo`}>{titulo}</h2>
        <p id={`${id}-texto`}>{texto}</p>
        <div className="modal-acoes">
          <button ref={seguro} type="button" className="botao botao-fantasma" disabled={ocupado} onClick={aoFechar}>
            {voltar}
          </button>
          <button
            type="button"
            className={`botao ${perigo ? 'botao-perigo' : 'botao-primario'}`}
            disabled={ocupado}
            onClick={aoConfirmar}
          >
            {ocupado && <span className="giro" aria-hidden="true" />}
            {ocupado ? 'Enviando…' : acao}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
