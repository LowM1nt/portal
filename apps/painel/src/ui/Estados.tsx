import type { ReactNode } from 'react'
import { IconeAlerta } from './icones.tsx'

type Props = { icone: ReactNode; titulo: string; texto: string; acao?: ReactNode }

/** Vazio: ícone num quadrado suave + frase + (quando fizer sentido) um botão. */
export function EstadoVazio({ icone, titulo, texto, acao }: Props) {
  return (
    <div className="estado">
      <span className="estado-icone">{icone}</span>
      <b className="estado-titulo">{titulo}</b>
      <span className="estado-texto">{texto}</span>
      {acao}
    </div>
  )
}

/** Erro: mesmo formato do vazio, em rosa; explica, tranquiliza e oferece "Tentar de novo". */
export function EstadoErro({ titulo, texto, aoTentar }: { titulo: string; texto: string; aoTentar: () => void }) {
  return (
    <div className="estado estado-erro" role="alert">
      <span className="estado-icone">
        <IconeAlerta />
      </span>
      <b className="estado-titulo">{titulo}</b>
      <span className="estado-texto">{texto}</span>
      <button type="button" className="botao botao-secundario" onClick={aoTentar}>
        Tentar de novo
      </button>
    </div>
  )
}

/** Carregando: o esqueleto tem o formato do conteúdo; o texto fica só para leitor de tela. */
export function Carregando({
  children,
  className = '',
  rotulo = 'Carregando…',
}: {
  children: ReactNode
  className?: string
  rotulo?: string
}) {
  return (
    <div className={className} aria-busy="true">
      <span className="sr">{rotulo}</span>
      <div aria-hidden="true" className="esqueleto">
        {children}
      </div>
    </div>
  )
}
