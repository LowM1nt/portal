import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { IconeX } from './icones.tsx'

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Foco preso no diálogo: entra no primeiro campo (sem campo, no próprio diálogo),
 * Tab dá a volta, Esc fecha e, ao sair, o foco volta para quem abriu.
 */
function useFocoPreso(caixa: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = caixa.current
    const alvo =
      el?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select') ??
      el
    alvo?.focus()
    return () => {
      if (antes?.isConnected) antes.focus()
    }
  }, [caixa])
}

function teclado(e: KeyboardEvent<HTMLElement>, caixa: HTMLElement | null, aoFechar: () => void) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    aoFechar()
    return
  }
  if (e.key !== 'Tab' || !caixa) return
  // O que está dentro de um <details> fechado não recebe foco.
  const lista = [...caixa.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((x) => !x.closest('details:not([open]) > :not(summary)'))
  if (lista.length === 0) return
  const [primeiro, ultimo] = [lista[0], lista[lista.length - 1]]
  if (e.shiftKey && document.activeElement === primeiro) {
    e.preventDefault()
    ultimo.focus()
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault()
    primeiro.focus()
  }
}

type Props = {
  titulo: string
  /** Linha pequena acima do título (ex.: "Bug · Discord"). */
  sobretitulo?: string
  descricao?: string
  aoFechar: () => void
  children: ReactNode
}

/** Modal central: para coisas curtas (confirmar, até ~5 campos). */
export function Modal({ titulo, descricao, aoFechar, children }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const id = useId()
  useFocoPreso(caixa)
  return (
    <>
      <div className="veu veu-sobre" onClick={aoFechar} aria-hidden="true" />
      <div
        ref={caixa}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={descricao ? `${id}-d` : undefined}
        tabIndex={-1}
        onKeyDown={(e) => teclado(e, caixa.current, aoFechar)}
      >
        <button type="button" className="botao-fechar" aria-label="Fechar" onClick={aoFechar}>
          <IconeX />
        </button>
        <h2 id={`${id}-t`} className="sobre-titulo">
          {titulo}
        </h2>
        {descricao && (
          <p id={`${id}-d`} className="sobre-desc">
            {descricao}
          </p>
        )}
        {children}
      </div>
    </>
  )
}

/** Painel lateral: para detalhes e formulários maiores. Ações ficam no rodapé (`rodape`). */
export function Painel({ titulo, sobretitulo, aoFechar, children, rodape }: Props & { rodape?: ReactNode }) {
  const caixa = useRef<HTMLElement>(null)
  const id = useId()
  useFocoPreso(caixa)
  return (
    <>
      <div className="veu veu-sobre" onClick={aoFechar} aria-hidden="true" />
      <aside
        ref={caixa}
        className="painel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        onKeyDown={(e) => teclado(e, caixa.current, aoFechar)}
      >
        <button type="button" className="botao-fechar" aria-label="Fechar" onClick={aoFechar}>
          <IconeX />
        </button>
        <div className="painel-corpo">
          <div className="painel-cab">
            {sobretitulo && <span className="secao-t">{sobretitulo}</span>}
            <h2 id={`${id}-t`} className="sobre-titulo">
              {titulo}
            </h2>
          </div>
          {children}
        </div>
        {rodape && <div className="painel-pe">{rodape}</div>}
      </aside>
    </>
  )
}
