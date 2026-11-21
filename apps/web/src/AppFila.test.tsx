import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

const sessao = { access_token: 'tok-app', user: { email: 'a@exemplo.com' } } as Session

function cliente(s: Session | null) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: s } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(async () => ({ error: null })),
  }
  return { auth, cliente: { auth } as unknown as SupabaseClient }
}
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

function stub() {
  const f = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/me'))
      return json({ usuarioId: 'u1', email: 'a@exemplo.com', workspaces: [{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }] })
    if (u.includes('/api/revisoes')) return json([])
    return json([])
  })
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => vi.unstubAllGlobals())

describe('App — fila de revisão', () => {
  it('com sessão e workspace ativo, o item "Revisões" aparece e trocar para ele renderiza a tela', async () => {
    const f = stub()
    render(<App cliente={cliente(sessao).cliente} />)
    const item = await screen.findByRole('link', { name: 'Revisões' })
    fireEvent.click(item)
    expect(await screen.findByText('Nenhuma PR esperando revisão')).toBeInTheDocument()
    const c = f.mock.calls.find(([u]) => String(u).includes('/api/revisoes')) as unknown as [string, RequestInit]
    expect(new Headers(c[1]?.headers).get('X-Workspace-Id')).toBe('w1')
  })

  it('sem sessão aparece só o login', async () => {
    stub()
    render(<App cliente={cliente(null).cliente} />)
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
    expect(screen.queryByText('Fila de revisão')).not.toBeInTheDocument()
  })

  it('401 na fila volta para o login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/me')
          ? json({ usuarioId: 'u1', email: 'a@exemplo.com', workspaces: [{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }] })
          : new Response('', { status: 401 }),
      ),
    )
    const { auth, cliente: c } = cliente(sessao)
    render(<App cliente={c} />)
    const item = await screen.findByRole('link', { name: 'Revisões' })
    fireEvent.click(item)
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
  })
})
