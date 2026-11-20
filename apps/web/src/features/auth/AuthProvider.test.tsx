import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'

// Testes do fluxo de autenticação pelo App (o AuthProvider envolve a aplicação).
const sessao = { access_token: 'tok-sessao', user: { email: 'a@exemplo.com' } } as Session

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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthProvider', () => {
  it('401 de /api/me faz signOut e volta para a tela de login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    const { auth, cliente } = clienteFalso(sessao)
    render(<App cliente={cliente} />)
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
  })

  it('sair chama signOut, limpa o workspace ativo e volta ao login', async () => {
    const fetchFalso = vi.fn(async () =>
      new Response(
        JSON.stringify({
          usuarioId: 'u1',
          email: 'a@exemplo.com',
          workspaces: [{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchFalso)
    const { cliente } = clienteFalso(sessao)
    render(<App cliente={cliente} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
    expect(screen.queryByText('Meu workspace')).not.toBeInTheDocument()
  })
})
