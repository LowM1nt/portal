import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'

export type Deploy = {
  id: string
  repositorioId: string
  titulo: string
  ambiente: string
  status: string
  agendadoPara: string
}

type Resultado = { chave: string; deploys: Deploy[] | null }

export function useDeploysDaSemana(semana: string) {
  const { api, workspaceAtivo } = useAuth()
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const chave = `${workspaceAtivo?.id ?? ''}#${semana}#${tentativa}`

  useEffect(() => {
    let ativo = true
    const terminar = (deploys: Deploy[] | null) => {
      if (ativo) setResultado({ chave, deploys })
    }
    api(`/api/deploys?semana=${encodeURIComponent(semana)}`)
      .then(async (r) => {
        const corpo: unknown = r.ok ? await r.json() : null
        terminar(Array.isArray(corpo) ? (corpo as Deploy[]) : null)
      })
      .catch(() => terminar(null))
    return () => {
      ativo = false
    }
  }, [api, semana, chave])

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
