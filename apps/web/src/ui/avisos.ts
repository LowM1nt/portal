import { createContext, useContext, useEffect } from 'react'
import { reduzirMovimento } from './preferencias.ts'

/** Tempo na tela de um aviso que some sozinho (com "reduzir movimento", um pouco mais, como no guia). */
export const duracaoToast = () => (reduzirMovimento() ? 8000 : 5000)

export type TipoAviso = 'ok' | 'erro' | 'info'

export type Aviso = { tipo: TipoAviso; titulo: string; texto?: string }

export type Avisos = {
  /** Mostra um toast e devolve o id dele. Erro não some sozinho; os outros somem em 5 s. */
  avisar: (aviso: Aviso) => number
  fechar: (id: number) => void
}

// Sem provedor (telas testadas sozinhas), avisar não faz nada.
const semProvedor: Avisos = { avisar: () => 0, fechar: () => undefined }

export const AvisosContexto = createContext<Avisos>(semProvedor)

export function useAvisos(): Avisos {
  return useContext(AvisosContexto)
}

/** Enquanto `erro` for verdadeiro, mantém um toast de erro na tela; some quando o erro passa. */
export function useAvisoDeErro(erro: boolean, titulo: string, texto: string) {
  const { avisar, fechar } = useAvisos()
  useEffect(() => {
    if (!erro) return
    const id = avisar({ tipo: 'erro', titulo, texto })
    return () => fechar(id)
  }, [erro, titulo, texto, avisar, fechar])
}
