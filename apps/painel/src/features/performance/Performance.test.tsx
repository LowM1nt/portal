import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Performance from './Performance.tsx'
import { clienteFalso, type Linha } from './clienteFalso.ts'

const semana: Linha[] = [
  { id: 1, ts: '2026-11-17T06:00:00Z', tipo: 'noite_resumo', dados: { prs: 3, fila_dificeis: 1 } },
  // fora de ordem de propósito: o mais recente é o de 19/11
  { id: 3, ts: '2026-11-19T06:00:00Z', tipo: 'noite_resumo', dados: { prs: 2, fila_dificeis: 6 } },
  { id: 2, ts: '2026-11-18T06:00:00Z', tipo: 'noite_resumo', dados: { prs: 2, fila_dificeis: 2 } },
  { id: 4, ts: '2026-11-17T03:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'pr_aberta', tokens_entrada: 1500, tokens_saida: 500 } },
  { id: 5, ts: '2026-11-18T03:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'pr_aberta', tokens_entrada: 2500, tokens_saida: 1500 } },
  { id: 6, ts: '2026-11-18T04:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'pr_aberta', tokens_entrada: 1000, tokens_saida: 1000 } },
  { id: 7, ts: '2026-11-19T03:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'reprovada', tokens_entrada: 3000, tokens_saida: 1000 } },
  { id: 8, ts: '2026-11-18T05:00:00Z', tipo: 'fallback_acionado', dados: { de: 'a', para: 'b', modelo: 'm' } },
  { id: 9, ts: '2026-11-19T05:00:00Z', tipo: 'fallback_acionado', dados: { de: 'a', para: 'b', modelo: 'm' } },
  { id: 10, ts: '2026-11-19T05:30:00Z', tipo: 'fallback_acionado', dados: { de: 'b', para: 'a', modelo: 'm' } },
]

// O indicador é o elemento que contém o rótulo e o valor.
function indicador(rotulo: RegExp) {
  const el = screen.getByText(rotulo).closest('section, article, li, div') as HTMLElement
  return el
}

describe('Performance', () => {
  it('com dados de uma semana, mostra os cinco indicadores', async () => {
    const { cliente } = clienteFalso({ linhas: semana })
    render(<Performance cliente={cliente} />)

    await screen.findByText(/PRs por noite/i)
    expect(indicador(/PRs por noite/i)).toHaveTextContent(/2[.,]33|2[.,]3\b/) // (3+2+2) ÷ 3 noites
    expect(indicador(/Taxa de aprovação nos portões/i)).toHaveTextContent(/75\s?%/)
    expect(indicador(/Tokens por tarefa/i)).toHaveTextContent(/3[.,]?000/) // (2000+4000+2000+4000) ÷ 4
    expect(indicador(/Fila de difíceis/i)).toHaveTextContent('6')
    expect(indicador(/Acionamentos do fallback/i)).toHaveTextContent('3')
  })

  it('a fila de difíceis mostra o valor do noite_resumo mais recente, não o somatório', async () => {
    const { cliente } = clienteFalso({ linhas: semana })
    render(<Performance cliente={cliente} />)

    await screen.findByText(/Fila de difíceis/i)
    const fila = indicador(/Fila de difíceis/i)
    expect(fila).toHaveTextContent('6')
    expect(fila).not.toHaveTextContent('9') // 1 + 2 + 6
  })

  it('valores null em tokens não entram na média ([100, null, 300] dá 200)', async () => {
    const linhas: Linha[] = [
      { id: 1, ts: '2026-11-19T03:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'pr_aberta', tokens_entrada: 100, tokens_saida: 0 } },
      { id: 2, ts: '2026-11-19T04:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'pr_aberta', tokens_entrada: null, tokens_saida: null } },
      { id: 3, ts: '2026-11-19T05:00:00Z', tipo: 'tarefa_metricas', dados: { resultado: 'pr_aberta', tokens_entrada: 300, tokens_saida: 0 } },
    ]
    const { cliente } = clienteFalso({ linhas })
    render(<Performance cliente={cliente} />)

    await screen.findByText(/Tokens por tarefa/i)
    expect(indicador(/Tokens por tarefa/i)).toHaveTextContent(/\b200\b/)
  })

  it('sem eventos no período, mostra o estado vazio', async () => {
    const { cliente } = clienteFalso({ linhas: [] })
    render(<Performance cliente={cliente} />)

    expect(await screen.findByText(/sem (eventos|dados)|nenhum (evento|dado)|ainda não há/i)).toBeInTheDocument()
    expect(screen.queryByText(/Taxa de aprovação nos portões/i)).not.toBeInTheDocument()
  })

  it('enquanto a consulta não responde, mostra o estado carregando', () => {
    const { cliente } = clienteFalso({ pendente: true })
    render(<Performance cliente={cliente} />)

    expect(screen.getByText(/Carregando/i)).toBeInTheDocument()
  })

  it('quando a consulta falha, mostra o erro e "Tentar de novo", que volta a carregar e consulta de novo', async () => {
    const usuario = userEvent.setup()
    const { cliente, from } = clienteFalso({ erro: true })
    render(<Performance cliente={cliente} />)

    const botao = await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    const antes = from.mock.calls.length

    await usuario.click(botao)
    expect(screen.getByText(/Carregando/i)).toBeInTheDocument()
    expect(from.mock.calls.length).toBeGreaterThan(antes)
  })
})
