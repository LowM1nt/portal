import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Performance from './Performance.tsx'
import { clienteFalso, type Linha } from './clienteFalso.ts'

const linhas: Linha[] = [
  { id: 1, ts: '2026-11-19T06:00:00Z', tipo: 'noite_resumo', dados: { prs: 2, fila_dificeis: 6 } },
  { id: 2, ts: '2026-11-19T03:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'pr_aberta', tokens_entrada: 1353831, tokens_saida: 0 } },
]

describe('Performance — acabamento (P-019)', () => {
  it('mostra o título da página', async () => {
    const { cliente } = clienteFalso({ linhas })
    render(<Performance cliente={cliente} />)
    expect(await screen.findByRole('heading', { level: 1, name: /Performance/ })).toBeInTheDocument()
  })

  it('as abas usam .abas > .aba com role=tab e aria-selected; trocar muda o período da consulta', async () => {
    const usuario = userEvent.setup()
    const { cliente, chamadas } = clienteFalso({ linhas })
    const { container } = render(<Performance cliente={cliente} />)
    await screen.findByText(/PRs por noite/)

    const sete = screen.getByRole('tab', { name: '7 dias' })
    const trinta = screen.getByRole('tab', { name: '30 dias' })
    expect(container.querySelectorAll('.abas > .aba')).toHaveLength(2)
    expect(sete).toHaveAttribute('aria-selected', 'true')
    expect(trinta).toHaveAttribute('aria-selected', 'false')

    const gtes = () => chamadas.filter((c) => c.metodo === 'gte').map((c) => String(c.args[1]))
    const antes = gtes().length
    await usuario.click(trinta)
    await screen.findByText(/PRs por noite/)
    expect(trinta).toHaveAttribute('aria-selected', 'true')
    expect(sete).toHaveAttribute('aria-selected', 'false')
    const depois = gtes()
    expect(depois.length).toBeGreaterThan(antes)
    expect(depois[depois.length - 1]).not.toBe(depois[0])
  })

  it('os números usam o formatador e ficam em .painel.numero', async () => {
    const { cliente } = clienteFalso({ linhas })
    const { container } = render(<Performance cliente={cliente} />)
    await screen.findByText(/Tokens por tarefa/)
    const cartao = screen.getByText(/Tokens por tarefa/).closest('.painel.numero') as HTMLElement
    expect(cartao).not.toBeNull()
    expect(within(cartao).getByText('1,4 mi')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('1.353.831')
    expect(container.querySelectorAll('.painel.numero').length).toBe(5)
  })

  it('estados vazio, erro e carregando continuam funcionando', async () => {
    const usuario = userEvent.setup()
    const vazio = clienteFalso({ linhas: [] })
    const a = render(<Performance cliente={vazio.cliente} />)
    expect(await screen.findByText(/Sem eventos/)).toBeInTheDocument()
    a.unmount()

    const erro = clienteFalso({ erro: true })
    const b = render(<Performance cliente={erro.cliente} />)
    const botao = await screen.findByRole('button', { name: 'Tentar de novo' })
    await usuario.click(botao)
    expect(screen.getByText(/Carregando/)).toBeInTheDocument()
    b.unmount()
  })
})
