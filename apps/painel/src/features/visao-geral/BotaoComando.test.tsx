import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BotaoComando from './BotaoComando.tsx'
import VisaoGeral from './VisaoGeral.tsx'
import { ToastProvider } from '../../ui/Toasts.tsx'
import { clienteContrato, type Opcoes } from '../../test/clienteContrato.ts'

function montar(opcoes: Opcoes = {}) {
  const c = clienteContrato(opcoes)
  render(
    <BotaoComando
      cliente={c.cliente}
      comando="pausar"
      rotulo="Pausar agente"
      variante="botao-perigo"
      confirmacao={{ titulo: 'Pausar o agente?', texto: 'O agente pausa assim que ler.', acao: 'Sim, pausar' }}
      ok="Comando de pausa enviado."
      falha="Não foi possível enviar o comando de pausa."
    />,
    { wrapper: ToastProvider },
  )
  return c
}

const dialogo = () => screen.queryByRole('dialog', { name: 'Pausar o agente?' })

afterEach(() => {
  vi.useRealTimers()
})

describe('Ações perigosas: confirmação (modal) + toast', () => {
  it('clicar abre o modal de confirmação e não grava nada ainda', async () => {
    const usuario = userEvent.setup()
    const { inserts } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Pausar agente' }))
    const modal = dialogo()!
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(modal).toHaveAccessibleDescription('O agente pausa assim que ler.')
    // o foco começa no caminho seguro
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(inserts).toHaveLength(0)
  })

  it('Esc, "Cancelar" e o X fecham sem gravar e devolvem o foco ao botão', async () => {
    const usuario = userEvent.setup()
    const { inserts } = montar()
    const botao = screen.getByRole('button', { name: 'Pausar agente' })

    await usuario.click(botao)
    await usuario.keyboard('{Escape}')
    expect(dialogo()).not.toBeInTheDocument()
    expect(botao).toHaveFocus()

    await usuario.click(botao)
    await usuario.click(within(dialogo()!).getByRole('button', { name: 'Cancelar' }))
    expect(dialogo()).not.toBeInTheDocument()

    await usuario.click(botao)
    await usuario.click(within(dialogo()!).getByRole('button', { name: 'Fechar' }))
    expect(dialogo()).not.toBeInTheDocument()
    expect(inserts).toHaveLength(0)
  })

  it('o foco fica preso no modal (Tab dá a volta)', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Pausar agente' }))
    const modal = dialogo()!
    const confirmar = within(modal).getByRole('button', { name: 'Sim, pausar' })
    await usuario.tab()
    expect(confirmar).toHaveFocus()
    await usuario.tab()
    expect(within(modal).getByRole('button', { name: 'Fechar' })).toHaveFocus()
    await usuario.tab({ shift: true })
    expect(confirmar).toHaveFocus()
  })

  it('confirmar grava o comando e mostra um toast de sucesso que some sozinho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { inserts } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Pausar agente' }))
    await usuario.click(screen.getByRole('button', { name: 'Sim, pausar' }))
    expect(inserts).toEqual([{ tabela: 'comandos', valor: { comando: 'pausar' } }])
    expect(await screen.findByRole('status')).toHaveTextContent('Comando de pausa enviado.')
    expect(dialogo()).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('se a gravação falha, o toast de erro fica até a pessoa fechar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar({ erroInsert: true })
    await usuario.click(screen.getByRole('button', { name: 'Pausar agente' }))
    await usuario.click(screen.getByRole('button', { name: 'Sim, pausar' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível enviar o comando de pausa.')
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await usuario.click(within(alerta).getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('na visão geral, Pausar e Cancelar post pedem confirmação antes de gravar', async () => {
    const usuario = userEvent.setup()
    const { cliente, inserts } = clienteContrato({
      linhas: {
        eventos: [{ id: 1, ts: '2026-11-19T07:00:00Z', tipo: 'noite_resumo', dados: { prs: 0 } }],
        sincronizacao: [],
        posts: [{ id: 7, texto: 'Post de amanhã', publicar_em: new Date(Date.now() + 86_400_000).toISOString() }],
      },
    })
    render(<VisaoGeral cliente={cliente} />, { wrapper: ToastProvider })
    await usuario.click(await screen.findByRole('button', { name: 'Pausar agente' }))
    expect(screen.getByRole('dialog', { name: 'Pausar o agente?' })).toBeInTheDocument()
    await usuario.keyboard('{Escape}')
    await usuario.click(screen.getByRole('button', { name: 'Cancelar post' }))
    const modal = screen.getByRole('dialog', { name: 'Cancelar este post?' })
    await usuario.click(within(modal).getByRole('button', { name: 'Manter post' }))
    expect(inserts).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
