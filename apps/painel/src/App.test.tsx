import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

function clienteFalso(sessaoInicial: Session | null, loginOk = true) {
  let ouvinte: ((evento: string, s: Session | null) => void) | undefined
  const sessaoDoDono = { user: { email: 'dono@exemplo.com' } } as Session
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: sessaoInicial } }),
    onAuthStateChange: vi.fn((cb: (evento: string, s: Session | null) => void) => {
      ouvinte = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn(async () => {
      if (!loginOk) return { error: { message: 'Invalid login credentials' } }
      ouvinte?.('SIGNED_IN', sessaoDoDono)
      return { error: null }
    }),
    signOut: vi.fn(async () => {
      ouvinte?.('SIGNED_OUT', null)
      return { error: null }
    }),
  }
  return { auth } as unknown as SupabaseClient
}

describe('App', () => {
  it('sem configuração do Supabase, explica o que falta', () => {
    render(<App cliente={null} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Painel do agente' })).toBeInTheDocument()
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
  })

  it('sem sessão, mostra o formulário de entrada', async () => {
    render(<App cliente={clienteFalso(null)} />)
    expect(await screen.findByRole('form', { name: 'Entrar no painel' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
  })

  it('com e-mail e senha corretos, entra e mostra quem está logado', async () => {
    const usuario = userEvent.setup()
    render(<App cliente={clienteFalso(null)} />)
    await usuario.type(await screen.findByLabelText('E-mail'), 'dono@exemplo.com')
    await usuario.type(screen.getByLabelText('Senha'), 'segredo')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('dono@exemplo.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('com senha errada, avisa sem revelar qual campo errou', async () => {
    const usuario = userEvent.setup()
    render(<App cliente={clienteFalso(null, false)} />)
    await usuario.type(await screen.findByLabelText('E-mail'), 'dono@exemplo.com')
    await usuario.type(screen.getByLabelText('Senha'), 'errada')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
  })

  it('com sessão salva, entra direto e sai ao clicar em Sair', async () => {
    const usuario = userEvent.setup()
    render(<App cliente={clienteFalso({ user: { email: 'dono@exemplo.com' } } as Session)} />)
    await usuario.click(await screen.findByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(screen.getByRole('form', { name: 'Entrar no painel' })).toBeInTheDocument())
  })
})
