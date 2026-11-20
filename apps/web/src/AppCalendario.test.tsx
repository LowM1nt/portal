import { render, screen } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

const sessao = { access_token: 'tok', user: { email: 'a@exemplo.com' } } as Session

function cliente(s: Session | null) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: s } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  }
  return { auth } as unknown as SupabaseClient
}

afterEach(() => vi.unstubAllGlobals())

describe('App — calendário de deploys', () => {
  it('depois do login, com workspace ativo, renderiza o Calendario', async () => {
    const f = vi.fn(async (url: string) =>
      String(url).includes('/api/me')
        ? new Response(
            JSON.stringify({ usuarioId: 'u1', email: 'a@exemplo.com', workspaces: [{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }] }),
            { status: 200 },
          )
        : new Response('[]', { status: 200 }),
    )
    vi.stubGlobal('fetch', f)
    render(<App cliente={cliente(sessao)} />)
    expect(await screen.findByText('Nenhum deploy nesta semana')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument()
  })

  it('sem sessão continua mostrando o login e não o Calendario', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<App cliente={cliente(null)} />)
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Próxima semana' })).not.toBeInTheDocument()
  })
})
