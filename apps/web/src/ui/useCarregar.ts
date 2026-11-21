import { useCallback, useEffect, useState } from 'react'

export type EstadoRecurso = 'carregando' | 'erro' | 'pronto'

export type Recurso<T> = {
  estado: EstadoRecurso
  dados: T | null
  /** Recarrega do zero (volta o esqueleto): para o "Tentar de novo". */
  recarregar: () => void
  /** Busca de novo sem tirar os dados da tela (depois de criar ou mover algo). */
  atualizar: () => void
  /** Troca os dados na hora, sem ir ao servidor (resposta de um POST/PATCH). */
  definir: (mudar: (atual: T) => T) => void
}

type Resultado<T> = { chave: string; dados: T | null }

/**
 * Carrega um recurso da API. `escopo` identifica a origem (workspace, semana…): quando muda, a
 * tela volta ao esqueleto; `null` não carrega nada. `carregar` deve ser estável (useCallback).
 */
export function useCarregar<T>(carregar: () => Promise<T>, escopo: string | null): Recurso<T> {
  const [tentativa, setTentativa] = useState(0)
  const [versao, setVersao] = useState(0)
  const [resultado, setResultado] = useState<Resultado<T> | null>(null)
  const chave = `${escopo}#${tentativa}`

  useEffect(() => {
    if (escopo === null) return
    let ativo = true
    carregar()
      .then((dados) => ativo && setResultado({ chave, dados }))
      .catch(() => ativo && setResultado({ chave, dados: null }))
    return () => {
      ativo = false
    }
  }, [carregar, escopo, chave, versao])

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])
  const atualizar = useCallback(() => setVersao((n) => n + 1), [])
  const definir = useCallback(
    (mudar: (atual: T) => T) =>
      setResultado((r) => (r && r.dados !== null ? { chave: r.chave, dados: mudar(r.dados) } : r)),
    [],
  )

  const atual = escopo !== null && resultado?.chave === chave ? resultado : null
  const estado: EstadoRecurso = !atual ? 'carregando' : atual.dados === null ? 'erro' : 'pronto'
  return { estado, dados: atual?.dados ?? null, recarregar, atualizar, definir }
}

/** Lê uma lista JSON da API; resposta que não é lista conta como erro. */
export async function lerLista<T>(resposta: Promise<Response>): Promise<T[]> {
  const r = await resposta
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const corpo: unknown = await r.json()
  if (!Array.isArray(corpo)) throw new Error('Resposta inválida')
  return corpo as T[]
}

/** Mensagem de erro do servidor (`{ erro }`), mostrada sempre como texto. */
export async function erroDoServidor(r: Response): Promise<string | null> {
  try {
    const corpo: unknown = await r.json()
    if (corpo && typeof corpo === 'object' && 'erro' in corpo && typeof corpo.erro === 'string') return corpo.erro
  } catch {
    // sem corpo JSON
  }
  return null
}
