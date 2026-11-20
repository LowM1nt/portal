import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { chamarApi } from './apiClient.ts'

export type Workspace = { id: string; nome: string; papel: string }

type Estado = 'carregando' | 'erro' | 'sem-sessao' | 'pronto'

type Contexto = {
  estado: Estado
  workspaces: Workspace[]
  workspaceAtivo: Workspace | null
  trocarWorkspace: (id: string) => void
  sair: () => Promise<void>
  tentarDeNovo: () => void
  cliente: SupabaseClient
}

const AuthContexto = createContext<Contexto | null>(null)

export function AuthProvider({ cliente, children }: { cliente: SupabaseClient; children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoLida, setSessaoLida] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<{ chave: string; workspaces: Workspace[] | null } | null>(null)
  const [escolhaId, setEscolhaId] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    void cliente.auth.getSession().then(({ data }) => {
      if (ativo) {
        setSessao(data.session)
        setSessaoLida(true)
      }
    })
    const { data } = cliente.auth.onAuthStateChange((_evento, nova) => setSessao(nova))
    return () => {
      ativo = false
      data.subscription.unsubscribe()
    }
  }, [cliente])

  const token = sessao?.access_token ?? null

  const chave = `${token ?? ''}#${tentativa}`

  useEffect(() => {
    if (!token) return
    let ativo = true
    const guardar = (workspaces: Workspace[] | null) => {
      if (ativo) setResultado({ chave, workspaces })
    }
    chamarApi('/api/me', {
      token,
      workspaceId: null,
      onNaoAutorizado: () => {
        void cliente.auth.signOut()
      },
    })
      .then(async (resposta) => {
        if (resposta.status === 401) return
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
        const corpo = (await resposta.json()) as { workspaces: Workspace[] }
        guardar(corpo.workspaces)
      })
      .catch(() => guardar(null))
    return () => {
      ativo = false
    }
  }, [cliente, token, chave])

  const sair = useCallback(async () => {
    await cliente.auth.signOut()
    setResultado(null)
    setEscolhaId(null)
  }, [cliente])

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])

  const atual = resultado?.chave === chave ? resultado : null
  const workspaces = useMemo(() => atual?.workspaces ?? [], [atual])
  const workspaceAtivo = workspaces.find((w) => w.id === escolhaId) ?? workspaces[0] ?? null

  let estado: Estado
  if (!sessaoLida) estado = 'carregando'
  else if (!sessao) estado = 'sem-sessao'
  else if (atual && atual.workspaces === null) estado = 'erro'
  else if (workspaceAtivo) estado = 'pronto'
  else estado = 'carregando'

  const valor = useMemo(
    () => ({ estado, workspaces, workspaceAtivo, trocarWorkspace: setEscolhaId, sair, tentarDeNovo, cliente }),
    [estado, workspaces, workspaceAtivo, sair, tentarDeNovo, cliente],
  )

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): Contexto {
  const valor = useContext(AuthContexto)
  if (!valor) throw new Error('useAuth precisa estar dentro de AuthProvider.')
  return valor
}
