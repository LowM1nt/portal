import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider.tsx'

const sessao = { access_token: 'tok-1', user: { id: 'u1' } } as Session

function clienteFalso(sessaoInicial: Session | null, falharSignOut = false) {
  let ouvinte: ((evento: string, s: Session | null) => void) | undefined
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: sessaoInicial } }),
    onAuthStateChange: vi.fn((cb: (evento: string, s: Session | null) => void) => {
      ouvinte = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signOut: vi.fn(async () => {
      if (falharSignOut) throw new Error('rede')
      ouvinte?.('SIGNED_OUT', null)
      return { error: null }
    }),
  }
  return { auth, emitir: (s: Session) => ouvinte?.('TOKEN_REFRESHED', s), cliente: { auth } as unknown as SupabaseClient }
}

function Consumidor() {
  const { estado, workspaceAtivo, sair, trocarWorkspace } = useAuth()
  return (
    <div>
      <p data-testid="estado">{estado}</p>
      <p data-testid="ativo">{workspaceAtivo?.nome ?? '-'}</p>
      <button onClick={() => void sair().catch(() => undefined)}>sair</button>
      <button onClick={() => trocarWorkspace('w2')}>trocar</button>
    </div>
  )
}

const me = (workspaces: unknown[]) => async () =>
  new Response(JSON.stringify({ usuarioId: 'u1', email: 'a@x.com', workspaces }), { status: 200 })

afterEach(() => vi.unstubAllGlobals())

describe('AuthProvider', () => {
  it('renovar o token não recarrega /api/me nem volta ao carregando', async () => {
    const fetchFalso = vi.fn(me([{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }]))
    vi.stubGlobal('fetch', fetchFalso)
    const { cliente, emitir } = clienteFalso(sessao)
    render(<AuthProvider cliente={cliente}><Consumidor /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('pronto'))
    emitir({ ...sessao, access_token: 'tok-2' } as Session)
    await Promise.resolve()
    expect(screen.getByTestId('estado')).toHaveTextContent('pronto')
    expect(fetchFalso).toHaveBeenCalledTimes(1)
  })

  it('lista vazia de workspaces vai para pronto, sem workspace ativo', async () => {
    vi.stubGlobal('fetch', vi.fn(me([])))
    render(<AuthProvider cliente={clienteFalso(sessao).cliente}><Consumidor /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('pronto'))
    expect(screen.getByTestId('ativo')).toHaveTextContent('-')
  })

  it('sair limpa o estado local mesmo quando signOut falha', async () => {
    vi.stubGlobal('fetch', vi.fn(me([{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }])))
    render(<AuthProvider cliente={clienteFalso(sessao, true).cliente}><Consumidor /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('pronto'))
    fireEvent.click(screen.getByText('sair'))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByTestId('estado')).not.toBeInTheDocument()
  })

  it('depois de sair, o próximo usuário não herda o workspace escolhido', async () => {
    const respostas = [
      [{ id: 'w1', nome: 'Primeiro', papel: 'dono' }, { id: 'w2', nome: 'Segundo', papel: 'dono' }],
      [{ id: 'w9', nome: 'Outro', papel: 'dono' }, { id: 'w2', nome: 'Segundo', papel: 'dono' }],
    ]
    vi.stubGlobal('fetch', vi.fn(async () => me(respostas.shift() ?? [])()))
    const { cliente, emitir } = clienteFalso(sessao)
    render(<AuthProvider cliente={cliente}><Consumidor /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('ativo')).toHaveTextContent('Primeiro'))
    fireEvent.click(screen.getByText('trocar'))
    expect(screen.getByTestId('ativo')).toHaveTextContent('Segundo')
    fireEvent.click(screen.getByText('sair'))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    emitir({ access_token: 'tok-9', user: { id: 'u2' } } as Session)
    await waitFor(() => expect(screen.getByTestId('ativo')).toHaveTextContent('Outro'))
  })
})
