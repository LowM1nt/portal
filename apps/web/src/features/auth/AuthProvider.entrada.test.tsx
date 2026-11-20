import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider.tsx'

function clienteFalso(loginOk = true) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null as Session | null } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(async () =>
      loginOk ? { error: null } : { error: { message: 'Invalid login credentials' } },
    ),
    signOut: vi.fn(),
  }
  return { auth, cliente: { auth } as unknown as SupabaseClient }
}

function renderizar(cliente: SupabaseClient) {
  return render(
    <AuthProvider cliente={cliente}>
      <nav aria-label="Principal">navegação do app</nav>
    </AuthProvider>,
  )
}

describe('AuthProvider — tela de entrada centralizada', () => {
  it('sem sessão, mostra o cartão de entrada e não a navegação', async () => {
    renderizar(clienteFalso().cliente)
    const titulo = await screen.findByRole('heading', { name: 'Entrar' })
    expect(titulo.closest('.painel')).not.toBeNull()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('o campo de e-mail recebe o foco inicial', async () => {
    renderizar(clienteFalso().cliente)
    expect(await screen.findByLabelText('E-mail')).toHaveFocus()
  })

  it('erro de login aparece dentro do cartão', async () => {
    const usuario = userEvent.setup()
    renderizar(clienteFalso(false).cliente)
    const titulo = await screen.findByRole('heading', { name: 'Entrar' })
    await usuario.type(screen.getByLabelText('E-mail'), 'a@exemplo.com')
    await usuario.type(screen.getByLabelText('Senha'), 'errada{Enter}')
    const alerta = await screen.findByRole('alert')
    expect(titulo.closest('.painel')).toContainElement(alerta)
  })
})
