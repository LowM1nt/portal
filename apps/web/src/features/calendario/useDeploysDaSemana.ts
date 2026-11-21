import { useCallback, useEffect, useState } from 'react'
export type Deploy = {
  id: string
  repositorioId: string
  titulo: string
  ambiente: string
  status: string
  agendadoPara: string
}

export type Fonte = {
  /** Chama a API (com ou sem sessão). */
  buscar: (caminho: string) => Promise<Response>
  /** Rota de listagem por semana, sem a query. */
  caminho: string
  /** Identifica a origem dos dados (workspace ativo, ou 'demo'). */
  escopo: string
}

type Resultado = { chave: string; deploys: Deploy[] | null }

/** `versao`: quando muda, busca de novo sem voltar ao esqueleto (depois de criar ou marcar um deploy). */
export function useDeploysDaSemana(semana: string, { buscar, caminho, escopo }: Fonte, versao = 0) {
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const chave = `${escopo}#${semana}#${tentativa}`

  useEffect(() => {
    let ativo = true
    const terminar = (deploys: Deploy[] | null) => {
      if (ativo) setResultado({ chave, deploys })
    }
    buscar(`${caminho}?semana=${encodeURIComponent(semana)}`)
      .then(async (r) => {
        const corpo: unknown = r.ok ? await r.json() : null
        terminar(Array.isArray(corpo) ? (corpo as Deploy[]) : null)
      })
      .catch(() => terminar(null))
    return () => {
      ativo = false
    }
  }, [buscar, caminho, semana, chave, versao])

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])
  const pronto = resultado?.chave === chave
  const deploys = pronto ? resultado.deploys : null
  return {
    carregando: !pronto,
    erro: pronto && deploys === null,
    vazio: deploys !== null && deploys.length === 0,
    dados: deploys ?? [],
    recarregar,
  }
}
