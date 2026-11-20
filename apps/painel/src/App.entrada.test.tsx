import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

function clienteFalso(loginOk = true) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(async () =>
      loginOk ? { error: null } : { error: { message: 'Invalid login credentials' } },
    ),
    signOut: vi.fn(),
  }
  return { auth, cliente: { auth } as unknown as SupabaseClient }
}

describe('App — tela de entrada centralizada', () => {
  it('sem sessão, mostra o cartão de entrada e não a navegação lateral', async () => {
    render(<App cliente={clienteFalso().cliente} />)
    const titulo = await screen.findByRole('heading', { name: 'Entrar' })
    expect(titulo.closest('.painel')).not.toBeNull()
    expect(screen.getByText('Madrugada')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('o campo de e-mail recebe o foco inicial', async () => {
    render(<App cliente={clienteFalso().cliente} />)
    const email = await screen.findByLabelText('E-mail')
    expect(email).toHaveFocus()
  })

  it('erro de login aparece dentro do cartão', async () => {
    const usuario = userEvent.setup()
    render(<App cliente={clienteFalso(false).cliente} />)
    const titulo = await screen.findByRole('heading', { name: 'Entrar' })
    await usuario.type(screen.getByLabelText('E-mail'), 'a@exemplo.com')
    await usuario.type(screen.getByLabelText('Senha'), 'errada')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    const alerta = await screen.findByRole('alert')
    expect(titulo.closest('.painel')).toContainElement(alerta)
  })

  it('Enter no formulário envia o login', async () => {
    const usuario = userEvent.setup()
    const { auth, cliente } = clienteFalso()
    render(<App cliente={cliente} />)
    await usuario.type(await screen.findByLabelText('E-mail'), 'a@exemplo.com')
    await usuario.type(screen.getByLabelText('Senha'), 'segredo{Enter}')
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@exemplo.com', password: 'segredo' })
  })
})
