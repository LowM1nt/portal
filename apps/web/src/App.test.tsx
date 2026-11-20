import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

const sessao = { access_token: 'tok-sessao', user: { email: 'a@exemplo.com' } } as Session

const doisWorkspaces = [
  { id: 'w1', nome: 'Meu workspace', papel: 'dono' },
  { id: 'w2', nome: 'Time Beta', papel: 'membro' },
]

function clienteFalso(sessaoInicial: Session | null) {
  let ouvinte: ((evento: string, s: Session | null) => void) | undefined
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: sessaoInicial } }),
    onAuthStateChange: vi.fn((cb: (evento: string, s: Session | null) => void) => {
      ouvinte = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(async () => {
      ouvinte?.('SIGNED_OUT', null)
      return { error: null }
    }),
  }
  return { auth, cliente: { auth } as unknown as SupabaseClient }
}

function respostaMe(workspaces = doisWorkspaces) {
  return new Response(JSON.stringify({ usuarioId: 'u1', email: 'a@exemplo.com', workspaces }), {
    status: 200,
  })
}

type Chamada = [string, RequestInit | undefined]

function cabecalho(chamada: Chamada, nome: string) {
  return new Headers(chamada[1]?.headers).get(nome)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App — autenticação e workspace ativo', () => {
  it('sem sessão, mostra o formulário de login e não chama fetch', async () => {
    const fetchFalso = vi.fn()
    vi.stubGlobal('fetch', fetchFalso)
    render(<App cliente={clienteFalso(null).cliente} />)
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it('com sessão, chama GET /api/me com o Bearer e ativa o primeiro workspace', async () => {
    const fetchFalso = vi.fn(async () => respostaMe())
    vi.stubGlobal('fetch', fetchFalso)
    render(<App cliente={clienteFalso(sessao).cliente} />)
    expect(await screen.findByText('Meu workspace')).toBeInTheDocument()
    const chamada = fetchFalso.mock.calls[0] as unknown as Chamada
    expect(String(chamada[0])).toContain('/api/me')
    expect(cabecalho(chamada, 'Authorization')).toBe('Bearer tok-sessao')
    expect(cabecalho(chamada, 'X-Workspace-Id')).toBeNull()
  })

  it('com mais de um workspace mostra o seletor e trocar muda o X-Workspace-Id das chamadas seguintes', async () => {
    const fetchFalso = vi.fn(async () => respostaMe())
    vi.stubGlobal('fetch', fetchFalso)
    render(<App cliente={clienteFalso(sessao).cliente} />)
    const seletor = await screen.findByRole('combobox')
    expect(seletor).toBeInTheDocument()
    fireEvent.change(seletor, { target: { value: 'w2' } })
    expect(await screen.findByText('Time Beta', { selector: ':not(option)' })).toBeInTheDocument()
    await waitFor(() => expect(seletor).toHaveValue('w2'))
  })

  it('com um só workspace o seletor não aparece', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaMe([doisWorkspaces[0]])))
    render(<App cliente={clienteFalso(sessao).cliente} />)
    expect(await screen.findByText('Meu workspace')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('mostra o estado carregando enquanto /api/me não responde', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    render(<App cliente={clienteFalso(sessao).cliente} />)
    expect(await screen.findByText('Carregando…')).toBeInTheDocument()
  })

  it('falha de /api/me mostra erro e "Tentar de novo" volta a carregar e refaz a chamada', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockRejectedValueOnce(new TypeError('rede'))
      .mockImplementation(async () => respostaMe())
    vi.stubGlobal('fetch', fetchFalso)
    render(<App cliente={clienteFalso(sessao).cliente} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    // segunda falha (erro de rede) também cai no estado de erro
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Meu workspace')).toBeInTheDocument()
    expect(fetchFalso).toHaveBeenCalledTimes(3)
  })

  it('401 de /api/me faz signOut e volta para o login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    const { auth, cliente } = clienteFalso(sessao)
    render(<App cliente={cliente} />)
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
  })

  it('clicar em "Sair" chama signOut, limpa o workspace ativo e mostra o login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaMe()))
    const { auth, cliente } = clienteFalso(sessao)
    render(<App cliente={cliente} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
    expect(screen.queryByText('Meu workspace')).not.toBeInTheDocument()
  })
})
