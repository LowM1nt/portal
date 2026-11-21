import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { chamarApi } from './apiClient.ts'
import { NovaSenha } from './NovaSenha.tsx'
import { TelasPublicas } from './TelasPublicas.tsx'
import { VerificarMfa } from './VerificarMfa.tsx'

export type Workspace = { id: string; nome: string; papel: string }

type Estado = 'carregando' | 'erro' | 'sem-sessao' | 'pronto'

type Contexto = {
  estado: Estado
  /** E-mail de quem está logado (mostrado no menu da conta). */
  email: string | null
  /** Login do GitHub de quem está logado (filtra "Esperando você"); null se não configurou. */
  githubLogin: string | null
  definirGithubLogin: (login: string | null) => void
  /** A API exige o código de duas etapas desta pessoa (token aal2) em toda rota (D-013). */
  mfaExigido: boolean
  /** Liga ou desliga essa exigência na API. Só funciona com a sessão aal2 (logo depois de conferir um código). */
  salvarMfaExigido: (exigir: boolean) => Promise<boolean>
  workspaces: Workspace[]
  workspaceAtivo: Workspace | null
  trocarWorkspace: (id: string) => void
  sair: () => Promise<void>
  tentarDeNovo: () => void
  api: (caminho: string, init?: RequestInit) => Promise<Response>
  cliente: SupabaseClient
}

const AuthContexto = createContext<Contexto | null>(null)

/** A sessão já passou pelo segundo fator (aal2)? Sem o SDK de MFA (testes) ou com erro, responde não. */
async function sessaoAal2(cliente: SupabaseClient): Promise<boolean> {
  const mfa = cliente.auth.mfa as SupabaseClient['auth']['mfa'] | undefined
  if (typeof mfa?.getAuthenticatorAssuranceLevel !== 'function') return false
  try {
    const { data, error } = await mfa.getAuthenticatorAssuranceLevel()
    return !error && data?.currentLevel === 'aal2'
  } catch {
    return false
  }
}

/**
 * Tem verificação em duas etapas e a sessão ainda não passou por ela (aal1 → aal2)? Sem o SDK de MFA
 * (testes) ou com erro na leitura, segue sem pedir o código.
 */
async function precisaSegundoFator(cliente: SupabaseClient): Promise<boolean> {
  const mfa = cliente.auth.mfa as SupabaseClient['auth']['mfa'] | undefined
  if (typeof mfa?.getAuthenticatorAssuranceLevel !== 'function') return false
  try {
    const { data, error } = await mfa.getAuthenticatorAssuranceLevel()
    return !error && data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
  } catch {
    return false
  }
}

export function AuthProvider({ cliente, children }: { cliente: SupabaseClient; children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoLida, setSessaoLida] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<{
    chave: string
    workspaces: Workspace[] | null
    githubLogin: string | null
    mfaExigido: boolean
  } | null>(null)
  // A API respondeu 403 mfa_necessario com este token: pede o código. Um token novo (aal2) desfaz sozinho.
  const [mfaPedidoNoToken, setMfaPedidoNoToken] = useState<string | null>(null)
  // Checagem de duas etapas guardada por usuário: renovar o token não volta ao carregando.
  const [aal, setAal] = useState<{ usuario: string; precisa: boolean } | null>(null)
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
    void precisaSegundoFator(cliente).then((precisa) => {
      if (ativo) setAal({ usuario: usuarioId, precisa })
    })
    return () => {
      ativo = false
    }
  }, [cliente, usuarioId, tokenAtual])

  /**
   * PUT /api/me/mfa com o token lido do SDK na hora: logo depois do verify, a sessão aal2 ainda não chegou ao estado
   * do React (tokenRef pode ser o aal1).
   */
  const salvarMfaExigido = useCallback(
    async (exigir: boolean) => {
      try {
        const { data } = await cliente.auth.getSession()
        const resposta = await chamarApi('/api/me/mfa', {
          token: data.session?.access_token ?? '',
          workspaceId: null,
          onNaoAutorizado: () => {
            void cliente.auth.signOut()
          },
          init: { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exigir }) },
        })
        if (!resposta.ok) return false
        setResultado((r) => (r ? { ...r, mfaExigido: exigir } : r))
        return true
      } catch {
        return false
      }
    },
    [cliente],
  )

  useEffect(() => {
    if (usuarioId === null) return
    let ativo = true
    const guardar = (workspaces: Workspace[] | null, githubLogin: string | null = null, mfaExigido = false) => {
      if (ativo) setResultado({ chave, workspaces, githubLogin, mfaExigido })
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
        const corpo = (await resposta.json()) as { workspaces: Workspace[]; githubLogin?: unknown; mfaExigido?: unknown }
        const mfaExigido = corpo.mfaExigido === true
        guardar(corpo.workspaces, typeof corpo.githubLogin === 'string' ? corpo.githubLogin : null, mfaExigido)
        // Duas etapas ligadas antes de a API exigir (ou um PUT que falhou): sessão aal2 sem a exigência → liga na API.
        if (!mfaExigido && ativo && (await sessaoAal2(cliente))) await salvarMfaExigido(true)
      })
      .catch(() => guardar(null))
    return () => {
      ativo = false
    }
  }, [cliente, usuarioId, chave, salvarMfaExigido])

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
  const definirGithubLogin = useCallback(
    (login: string | null) => setResultado((r) => (r ? { ...r, githubLogin: login } : r)),
    [],
  )

  const atual = resultado?.chave === chave ? resultado : null
  const workspaces = useMemo(() => atual?.workspaces ?? [], [atual])
  const githubLogin = atual?.githubLogin ?? null
  const mfaExigido = atual?.mfaExigido ?? false
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
        // Não desloga: leva para a etapa do código.
        onMfaNecessario: () => setMfaPedidoNoToken(tokenRef.current),
        init,
      }),
    [cliente, workspaceAtivoId],
  )

  let estado: Estado
  if (!sessaoLida) estado = 'carregando'
  else if (!sessao) estado = 'sem-sessao'
  else if (!atual || aal?.usuario !== usuarioId) estado = 'carregando'
  else if (atual.workspaces === null) estado = 'erro'
  else estado = 'pronto'

  const valor = useMemo(
    () => ({
      estado,
      email,
      githubLogin,
      definirGithubLogin,
      mfaExigido,
      salvarMfaExigido,
      workspaces,
      workspaceAtivo,
      trocarWorkspace: setEscolhaId,
      sair,
      tentarDeNovo,
      api,
      cliente,
    }),
    [estado, email, githubLogin, definirGithubLogin, mfaExigido, salvarMfaExigido, workspaces, workspaceAtivo, sair, tentarDeNovo, api, cliente],
  )

  return (
    <AuthContexto.Provider value={valor}>
      {recuperando && sessao ? (
        <NovaSenha cliente={cliente} aoConcluir={() => setRecuperando(false)} />
      ) : estado === 'sem-sessao' ? (
        <TelasPublicas cliente={cliente} />
      ) : sessao && ((aal?.usuario === usuarioId && aal.precisa) || (mfaPedidoNoToken !== null && mfaPedidoNoToken === tokenAtual)) ? (
        <VerificarMfa
          cliente={cliente}
          aoSair={() => void sair().catch(() => undefined)}
          aoVerificado={() => {
            if (!mfaExigido) void salvarMfaExigido(true)
          }}
        />
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
