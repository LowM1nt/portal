import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { clienteContrato } from './test/clienteContrato.ts'

function clienteLogado() {
  const { cliente } = clienteContrato({ linhas: { eventos: [], sincronizacao: [], posts: [] } })
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: 'dono@exemplo.com' } } as Session } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  return Object.assign(cliente, { auth })
}

describe('App — casca', () => {
  it('mostra a barra lateral com Visão geral e Performance e troca de visão ao clicar', async () => {
    const usuario = userEvent.setup()
    const { container } = render(<App cliente={clienteLogado()} />)

    const lateral = await screen.findByRole('navigation', { name: 'Principal' })
    expect(container.querySelector('.app')).not.toBeNull()
    const visao = within(lateral).getByRole('link', { name: 'Visão geral' })
    const perf = within(lateral).getByRole('link', { name: 'Performance' })
    expect(visao).toHaveClass('nav-item')
    expect(visao).toHaveAttribute('aria-current', 'page')

    expect(screen.queryByText(/7 dias/)).not.toBeInTheDocument()
    await usuario.click(perf)
    expect(await screen.findByText(/7 dias/)).toBeInTheDocument()
    expect(perf).toHaveAttribute('aria-current', 'page')
    expect(visao).not.toHaveAttribute('aria-current')
  })

  it('tem a .barra do celular com os mesmos destinos', async () => {
    const { container } = render(<App cliente={clienteLogado()} />)
    await screen.findByRole('navigation', { name: 'Principal' })
    const barra = container.querySelector('.barra')
    expect(barra).not.toBeNull()
    expect(within(barra as HTMLElement).getByText('Visão geral')).toBeInTheDocument()
    expect(within(barra as HTMLElement).getByText('Performance')).toBeInTheDocument()
  })

  it('mantém "Sair" visível e sem largura fixa que vaze', async () => {
    const { container } = render(<App cliente={clienteLogado()} />)
    const sair = await screen.findByRole('button', { name: 'Sair' })
    expect(sair).toHaveClass('botao')
    for (const el of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/(^|;)\s*(min-)?width\s*:\s*\d+px/)
    }
  })
})
