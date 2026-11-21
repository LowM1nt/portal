import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Casca, type Conta, type ItemNav } from './Casca.tsx'
import { IconePerformance, IconeVisao } from './icones.tsx'
import { esquecerTema } from './tema.ts'

type Destino = 'visao-geral' | 'performance'
const ITENS: ItemNav<Destino>[] = [
  { id: 'visao-geral', nome: 'Visão geral', icone: <IconeVisao /> },
  { id: 'performance', nome: 'Performance', icone: <IconePerformance /> },
]

function Montada({ conta }: { conta: Conta }) {
  const [destino, ir] = useState<Destino>('visao-geral')
  return (
    <Casca itens={ITENS} ativo={destino} aoIr={ir} conta={conta}>
      <h1>Tela {destino}</h1>
    </Casca>
  )
}

function montar() {
  const conta: Conta = { email: 'dono@exemplo.com', aoSair: vi.fn() }
  render(<Montada conta={conta} />)
  return conta
}

const nav = () => screen.getByRole('navigation', { name: 'Principal' })
const link = (nome: string) => within(nav()).getByRole('link', { name: nome })
const ctrlK = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
const paleta = () => screen.queryByRole('dialog', { name: 'Busca rápida' })

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  esquecerTema()
})

describe('Casca — dock (computador) e abas (celular)', () => {
  it('mostra os destinos com nome acessível e marca o ativo com aria-current', () => {
    montar()
    expect(within(nav()).getAllByRole('link')).toHaveLength(2)
    expect(link('Visão geral')).toHaveAttribute('aria-current', 'page')
    expect(link('Performance')).not.toHaveAttribute('aria-current')
    // o nome fica na dica (computador) e no rótulo da aba (celular): é o mesmo elemento
    expect(within(link('Performance')).getByText('Performance')).toHaveClass('dock-rotulo')
  })

  it('clicar num destino troca a tela e o aria-current', () => {
    montar()
    fireEvent.click(link('Performance'))
    expect(screen.getByRole('heading', { name: 'Tela performance' })).toBeInTheDocument()
    expect(link('Performance')).toHaveAttribute('aria-current', 'page')
    expect(link('Visão geral')).not.toHaveAttribute('aria-current')
  })

  it('Esc fecha o menu da conta e devolve o foco ao avatar', () => {
    montar()
    const avatar = screen.getByRole('button', { name: 'Sua conta' })
    fireEvent.click(avatar)
    expect(avatar).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Sair' }), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument()
    expect(avatar).toHaveFocus()
  })

  it('o tema troca pelo menu da conta e o rótulo acompanha', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sua conta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: 'Sua conta' }))
    expect(screen.getByRole('button', { name: 'Usar tema escuro' })).toBeInTheDocument()
  })
})

describe('Casca — busca rápida (Ctrl+K)', () => {
  it('Ctrl+K abre um diálogo modal com o foco no campo; Esc fecha e devolve o foco', () => {
    montar()
    const busca = screen.getByRole('button', { name: 'Buscar (Ctrl+K)' })
    busca.focus()
    ctrlK()
    const dialogo = paleta()!
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    const campo = within(dialogo).getByRole('combobox')
    expect(campo).toHaveFocus()
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(paleta()).not.toBeInTheDocument()
    expect(busca).toHaveFocus()
  })

  it('o botão de busca também abre, e Ctrl+K de novo fecha', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar (Ctrl+K)' }))
    expect(paleta()).toBeInTheDocument()
    ctrlK()
    expect(paleta()).not.toBeInTheDocument()
  })

  it('setas mudam a opção selecionada e Enter executa', () => {
    montar()
    ctrlK()
    const campo = within(paleta()!).getByRole('combobox')
    fireEvent.keyDown(campo, { key: 'ArrowUp' }) // dá a volta: última opção
    const selecionada = within(paleta()!).getByRole('option', { selected: true })
    expect(selecionada).toHaveTextContent('Performance')
    expect(campo).toHaveAttribute('aria-activedescendant', selecionada.id)
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(paleta()).not.toBeInTheDocument()
    expect(link('Performance')).toHaveAttribute('aria-current', 'page')
  })

  it('Tab não deixa o foco sair do diálogo', () => {
    montar()
    ctrlK()
    const campo = within(paleta()!).getByRole('combobox')
    const evento = fireEvent.keyDown(campo, { key: 'Tab' })
    expect(evento).toBe(false) // padrão cancelado
    expect(campo).toHaveFocus()
  })

  it('tem as ações de alternar tema e sair', () => {
    const conta = montar()
    ctrlK()
    fireEvent.click(within(paleta()!).getByRole('option', { name: 'Alternar tema claro/escuro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    ctrlK()
    fireEvent.click(within(paleta()!).getByRole('option', { name: 'Sair' }))
    expect(conta.aoSair).toHaveBeenCalledTimes(1)
  })

  it('busca sem resultado avisa com uma frase', () => {
    montar()
    ctrlK()
    fireEvent.change(within(paleta()!).getByRole('combobox'), { target: { value: 'pausar' } })
    expect(within(paleta()!).getByText('Nada encontrado')).toBeInTheDocument()
  })
})
