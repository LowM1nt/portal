import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Casca, type Conta, type ItemNav } from './Casca.tsx'
import { IconeDeploys, IconeRevisoes } from './icones.tsx'
import { useDestino } from './rota.ts'
import { esquecerTema } from './tema.ts'

const ITENS: ItemNav[] = [
  { id: 'deploys', nome: 'Deploys', icone: <IconeDeploys /> },
  { id: 'revisoes', nome: 'Revisões', icone: <IconeRevisoes /> },
]

function Montada({ conta }: { conta: Conta | null }) {
  const [destino, ir] = useDestino()
  return (
    <Casca itens={ITENS} ativo={destino} aoIr={ir} conta={conta}>
      <h1>Tela {destino}</h1>
    </Casca>
  )
}

function montar(conta: Conta | null = { email: 'ana@exemplo.com', aoSair: vi.fn() }) {
  render(<Montada conta={conta} />)
  return conta
}

const nav = () => screen.getByRole('navigation', { name: 'Navegação principal' })
const link = (nome: string) => within(nav()).getByRole('link', { name: nome })
const ctrlK = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
const paleta = () => screen.queryByRole('dialog', { name: 'Busca rápida' })

beforeEach(() => {
  // Sem hash o destino padrão é o Início; estes testes partem dos Deploys.
  window.history.replaceState(null, '', '/#/deploys')
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  esquecerTema()
})

describe('Casca — dock (computador) e abas (celular)', () => {
  it('mostra os destinos que existem com o nome acessível e marca o ativo com aria-current', () => {
    montar()
    expect(within(nav()).getAllByRole('link')).toHaveLength(2)
    expect(link('Deploys')).toHaveAttribute('aria-current', 'page')
    expect(link('Revisões')).not.toHaveAttribute('aria-current')
    expect(link('Revisões')).toHaveAttribute('href', '#/revisoes')
    // o nome fica visível na dica (computador) e no rótulo da aba (celular): é o mesmo elemento
    expect(within(link('Revisões')).getByText('Revisões')).toHaveClass('dock-rotulo')
  })

  it('clicar num destino navega, muda o aria-current e guarda no endereço', () => {
    montar()
    fireEvent.click(link('Revisões'))
    expect(screen.getByRole('heading', { name: 'Tela revisoes' })).toBeInTheDocument()
    expect(link('Revisões')).toHaveAttribute('aria-current', 'page')
    expect(link('Deploys')).not.toHaveAttribute('aria-current')
    expect(window.location.hash).toBe('#/revisoes')
  })

  it('o botão voltar do navegador volta o destino', () => {
    montar()
    fireEvent.click(link('Revisões'))
    window.history.replaceState(null, '', '#/deploys')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(link('Deploys')).toHaveAttribute('aria-current', 'page')
  })

  it('o menu da conta mostra o e-mail, troca o tema e sai', () => {
    const conta = montar()!
    const avatar = within(nav()).getByRole('button', { name: 'Sua conta' })
    expect(avatar).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(avatar)
    expect(avatar).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument()

    fireEvent.click(avatar)
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(conta.aoSair).toHaveBeenCalledTimes(1)
  })

  it('Esc fecha o menu da conta e devolve o foco ao avatar', () => {
    montar()
    const avatar = screen.getByRole('button', { name: 'Sua conta' })
    fireEvent.click(avatar)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Sair' }), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument()
    expect(avatar).toHaveFocus()
  })

  it('na demo (sem conta) não há menu de conta, só o botão de tema', () => {
    montar(null)
    expect(screen.queryByRole('button', { name: 'Sua conta' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
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

  it('filtrar e dar Enter navega para o destino e fecha', () => {
    montar()
    ctrlK()
    const campo = within(paleta()!).getByRole('combobox')
    fireEvent.change(campo, { target: { value: 'revis' } })
    expect(within(paleta()!).getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(paleta()).not.toBeInTheDocument()
    expect(link('Revisões')).toHaveAttribute('aria-current', 'page')
  })

  it('setas mudam a opção selecionada (com aria-activedescendant) e dão a volta', () => {
    montar()
    ctrlK()
    const campo = within(paleta()!).getByRole('combobox')
    const opcoes = within(paleta()!).getAllByRole('option')
    expect(opcoes.map((o) => o.textContent)).toEqual(['Alternar tema claro/escuro', 'Sair', 'Deploys', 'Revisões'])
    expect(opcoes[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    const selecionada = within(paleta()!).getByRole('option', { selected: true })
    expect(selecionada).toHaveTextContent('Deploys')
    expect(campo).toHaveAttribute('aria-activedescendant', selecionada.id)
    fireEvent.keyDown(campo, { key: 'ArrowUp' })
    fireEvent.keyDown(campo, { key: 'ArrowUp' })
    fireEvent.keyDown(campo, { key: 'ArrowUp' })
    expect(within(paleta()!).getByRole('option', { selected: true })).toHaveTextContent('Revisões')
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
    const conta = montar()!
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
    fireEvent.change(within(paleta()!).getByRole('combobox'), { target: { value: 'xyz' } })
    expect(within(paleta()!).getByText('Nada encontrado')).toBeInTheDocument()
  })

  it('Ctrl+K funciona no instante em que a casca aparece (aparelho lento / usuário rápido)', async () => {
    // Fora do act, como no navegador: o React desenha numa tarefa e só roda os useEffect numa tarefa
    // seguinte. A tecla vem logo que a casca aparece, antes dessa tarefa: o atalho não pode se perder.
    const ambiente = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const antes = ambiente.IS_REACT_ACT_ENVIRONMENT
    ambiente.IS_REACT_ACT_ENVIRONMENT = false
    const host = document.body.appendChild(document.createElement('div'))
    const raiz = createRoot(host)
    try {
      const apareceu = new Promise<void>((resolver) => {
        const observador = new MutationObserver(() => {
          if (!host.querySelector('nav')) return
          observador.disconnect()
          ctrlK()
          resolver()
        })
        observador.observe(host, { childList: true, subtree: true })
      })
      raiz.render(<Montada conta={{ email: 'ana@exemplo.com', aoSair: vi.fn() }} />)
      await apareceu
      await waitFor(() => expect(paleta()).toBeInTheDocument())
    } finally {
      raiz.unmount()
      host.remove()
      ambiente.IS_REACT_ACT_ENVIRONMENT = antes
    }
  })
})
