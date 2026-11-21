import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider.tsx'
import { ToastProvider } from '../../ui/Toasts.tsx'
import { TransicaoProvider } from '../../ui/Transicao.tsx'

function clienteFalso(loginOk = true) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null as Session | null } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(async () => (loginOk ? { error: null } : { error: { message: 'Invalid login credentials' } })),
    signOut: vi.fn(),
  }
  return { auth, cliente: { auth } as unknown as SupabaseClient }
}

function montar(cliente: SupabaseClient) {
  return render(
    <ToastProvider>
      <TransicaoProvider>
        <AuthProvider cliente={cliente}>
          <p>casca</p>
        </AuthProvider>
      </TransicaoProvider>
    </ToastProvider>,
  )
}

async function entrar() {
  fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'a@exemplo.com' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

const reduzir = (sim: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: sim && q.includes('reduce'), media: q }))

afterEach(() => vi.unstubAllGlobals())

describe('Entrar (login L2)', () => {
  it('mostra a marca ("Deploy sem drama. Release sem susto.") ao lado do formulário, sem botão do GitHub', async () => {
    montar(clienteFalso().cliente)
    expect(await screen.findByRole('form', { name: 'Entrar no portal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Deploy sem drama.Release sem susto.')
    expect(screen.getAllByRole('img', { name: 'Releasy' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /github/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a demo' })).toHaveAttribute('href', '/demo')
  })

  it('ao entrar, dispara a varredura de luz e dá as boas-vindas num toast', async () => {
    reduzir(false)
    const { auth, cliente } = clienteFalso()
    montar(cliente)
    await entrar()
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalled())
    expect(await screen.findByTestId('varredura')).toBeInTheDocument()
    expect(screen.getByText('Que bom te ver por aqui!')).toBeInTheDocument()
  })

  it('com "reduzir movimento", entra sem varredura (mas com as boas-vindas)', async () => {
    reduzir(true)
    const { auth, cliente } = clienteFalso()
    montar(cliente)
    await entrar()
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalled())
    expect(await screen.findByText('Que bom te ver por aqui!')).toBeInTheDocument()
    expect(screen.queryByTestId('varredura')).not.toBeInTheDocument()
  })

  it('login errado: mensagem no formulário, sem varredura e sem boas-vindas', async () => {
    reduzir(false)
    montar(clienteFalso(false).cliente)
    await entrar()
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha não batem')
    expect(screen.queryByTestId('varredura')).not.toBeInTheDocument()
    expect(screen.queryByText('Que bom te ver por aqui!')).not.toBeInTheDocument()
  })
})
