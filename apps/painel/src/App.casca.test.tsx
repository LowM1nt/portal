import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { clienteContrato } from './test/clienteContrato.ts'
import { esquecerTema } from './ui/tema.ts'

function clienteLogado() {
  const { cliente } = clienteContrato({ linhas: { eventos: [], sincronizacao: [], posts: [] } })
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: 'dono@exemplo.com' } } as Session } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  return Object.assign(cliente, { auth })
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  esquecerTema()
})

describe('App — casca do Releasy', () => {
  it('o dock tem Visão geral e Performance (só as telas que existem) e troca de visão ao clicar', async () => {
    const usuario = userEvent.setup()
    const { container } = render(<App cliente={clienteLogado()} />)

    const dock = await screen.findByRole('navigation', { name: 'Principal' })
    expect(container.querySelector('.casca .aurora, .aurora')).not.toBeNull()
    expect(within(dock).getAllByRole('link')).toHaveLength(2)
    const visao = within(dock).getByRole('link', { name: 'Visão geral' })
    const perf = within(dock).getByRole('link', { name: 'Performance' })
    expect(visao).toHaveClass('dock-item')
    expect(visao).toHaveAttribute('aria-current', 'page')

    expect(screen.queryByText(/7 dias/)).not.toBeInTheDocument()
    await usuario.click(perf)
    expect(await screen.findByRole('tab', { name: '7 dias' })).toBeInTheDocument()
    expect(perf).toHaveAttribute('aria-current', 'page')
    expect(visao).not.toHaveAttribute('aria-current')
  })

  it('no celular o mesmo menu vira abas no rodapé: cada aba tem ícone e nome', async () => {
    render(<App cliente={clienteLogado()} />)
    const dock = await screen.findByRole('navigation', { name: 'Principal' })
    for (const nome of ['Visão geral', 'Performance']) {
      const aba = within(dock).getByRole('link', { name: nome })
      expect(within(aba).getByText(nome)).toHaveClass('dock-rotulo')
      expect(aba.querySelector('.dock-ic svg')).not.toBeNull()
    }
    // topo do celular com a marca m1nt.
    expect(document.querySelector('.topo-cel')).toContainElement(screen.getAllByRole('img', { name: 'm1nt.' })[0])
  })

  it('o avatar abre o menu da conta com o e-mail, o tema e o Sair', async () => {
    const usuario = userEvent.setup()
    const cliente = clienteLogado()
    render(<App cliente={cliente} />)
    const avatar = await screen.findByRole('button', { name: 'Sua conta' })
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument()
    await usuario.click(avatar)
    expect(screen.getByText('dono@exemplo.com')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    await usuario.click(avatar)
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    expect(cliente.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+K só tem destinos e ações seguras: nada de Pausar, Cancelar post ou Trocar perfil', async () => {
    render(<App cliente={clienteLogado()} />)
    await screen.findByRole('navigation', { name: 'Principal' })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const busca = screen.getByRole('dialog', { name: 'Busca rápida' })
    const nomes = within(busca).getAllByRole('option').map((o) => o.textContent)
    expect(nomes).toEqual(['Alternar tema claro/escuro', 'Sair', 'Visão geral', 'Performance'])
    expect(nomes.join(' ')).not.toMatch(/pausar|cancelar|perfil/i)
  })

  it('Ctrl+K "perf" + Enter vai para Performance', async () => {
    render(<App cliente={clienteLogado()} />)
    const dock = await screen.findByRole('navigation', { name: 'Principal' })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const campo = within(screen.getByRole('dialog', { name: 'Busca rápida' })).getByRole('combobox')
    fireEvent.change(campo, { target: { value: 'perf' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(screen.queryByRole('dialog', { name: 'Busca rápida' })).not.toBeInTheDocument()
    expect(within(dock).getByRole('link', { name: 'Performance' })).toHaveAttribute('aria-current', 'page')
  })

  it('não usa largura fixa em px no estilo inline', async () => {
    const { container } = render(<App cliente={clienteLogado()} />)
    await screen.findByRole('button', { name: 'Sua conta' })
    for (const el of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/(^|;)\s*(min-)?width\s*:\s*\d+px/)
    }
  })
})
