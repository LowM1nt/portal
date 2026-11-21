import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { chamarApi } from './apiClient.ts'
import { NovaSenha } from './NovaSenha.tsx'
import { TelasPublicas } from './TelasPublicas.tsx'

export type Workspace = { id: string; nome: string; papel: string }

type Estado = 'carregando' | 'erro' | 'sem-sessao' | 'pronto'

type Contexto = {
  estado: Estado
  /** E-mail de quem está logado (mostrado no menu da conta). */
  email: string | null
  workspaces: Workspace[]
  workspaceAtivo: Workspace | null
  trocarWorkspace: (id: string) => void
  sair: () => Promise<void>
  tentarDeNovo: () => void
  api: (caminho: string, init?: RequestInit) => Promise<Response>
  cliente: SupabaseClient
}

const AuthContexto = createContext<Contexto | null>(null)

export function AuthProvider({ cliente, children }: { cliente: SupabaseClient; children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoLida, setSessaoLida] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<{ chave: string; workspaces: Workspace[] | null } | null>(null)
  const [escolhaId, setEscolhaId] = useState<string | null>(null)
  // Chegou pelo link de "Esqueci a senha": antes de tudo, escolhe a senha nova.
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    let ativo = true
    void cliente.auth.getSession().then(({ data }) => {
      if (ativo) {
        setSessao(data.session)
        setSessaoLida(true)
      }
    })
    const { data } = cliente.auth.onAuthStateChange((evento, nova) => {
      setSessao(nova)
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
    })
    return () => {
      ativo = false
      data.subscription.unsubscribe()
    }
  }, [cliente])

  // O token é lido na hora de cada chamada: renovar o token não recarrega nada.
  const tokenRef = useRef<string | null>(null)
  const tokenAtual = sessao?.access_token ?? null
  useEffect(() => {
    tokenRef.current = tokenAtual
  }, [tokenAtual])

  const usuarioId = sessao ? String(sessao.user?.id ?? '') : null
  const email = sessao?.user?.email ?? null
  const chave = `${usuarioId ?? ''}#${tentativa}`

  useEffect(() => {
    if (usuarioId === null) return
    let ativo = true
    const guardar = (workspaces: Workspace[] | null) => {
      if (ativo) setResultado({ chave, workspaces })
    }
    chamarApi('/api/me', {
      token: tokenRef.current ?? '',
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
  }, [cliente, usuarioId, chave])

  const sair = useCallback(async () => {
    try {
      await cliente.auth.signOut()
    } finally {
      setSessao(null)
      setResultado(null)
      setEscolhaId(null)
    }
  }, [cliente])

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])

  const atual = resultado?.chave === chave ? resultado : null
  const workspaces = useMemo(() => atual?.workspaces ?? [], [atual])
  const workspaceAtivo = workspaces.find((w) => w.id === escolhaId) ?? workspaces[0] ?? null

  const workspaceAtivoId = workspaceAtivo?.id ?? null
  const api = useCallback(
    (caminho: string, init?: RequestInit) =>
      chamarApi(caminho, {
        token: tokenRef.current ?? '',
        workspaceId: workspaceAtivoId,
        onNaoAutorizado: () => {
          void cliente.auth.signOut()
        },
        init,
      }),
    [cliente, workspaceAtivoId],
  )

  let estado: Estado
  if (!sessaoLida) estado = 'carregando'
  else if (!sessao) estado = 'sem-sessao'
  else if (!atual) estado = 'carregando'
  else if (atual.workspaces === null) estado = 'erro'
  else estado = 'pronto'

  const valor = useMemo(
    () => ({ estado, email, workspaces, workspaceAtivo, trocarWorkspace: setEscolhaId, sair, tentarDeNovo, api, cliente }),
    [estado, email, workspaces, workspaceAtivo, sair, tentarDeNovo, api, cliente],
  )

  return (
    <AuthContexto.Provider value={valor}>
      {recuperando && sessao ? (
        <NovaSenha cliente={cliente} aoConcluir={() => setRecuperando(false)} />
      ) : estado === 'sem-sessao' ? (
        <TelasPublicas cliente={cliente} />
      ) : (
        children
      )}
    </AuthContexto.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): Contexto {
  const valor = useContext(AuthContexto)
  if (!valor) throw new Error('useAuth precisa estar dentro de AuthProvider.')
  return valor
}
