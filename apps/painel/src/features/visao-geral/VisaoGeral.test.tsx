import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import VisaoGeral from './VisaoGeral.tsx'
import { clienteContrato, type LinhaEvento } from '../../test/clienteContrato.ts'

const RESUMO: LinhaEvento = {
  id: 100,
  ts: '2026-11-19T07:00:00Z',
  tipo: 'noite_resumo',
  origem: 'agente',
  dados: { prs: 3, reprovadas: 1, fila_dificeis: 1, fallbacks: 0, quedas: 0, minutos_fora: 0, perfil: 'principal' },
}

function metricas(id: number, ts: string, item: string, extra: Record<string, unknown> = {}): LinhaEvento {
  return {
    id,
    ts,
    tipo: 'tarefa_metricas',
    origem: 'agente',
    dados: {
      item,
      resultado: 'pr_aberta',
      perfil: 'principal',
      tentativas: 1,
      requisicoes: 10,
      tokens_entrada: 1000,
      tokens_saida: 500,
      segundos_modelo: 600,
      custo_usd: 0,
      modelos: ['m'],
      ...extra,
    },
  }
}

const planejada = (id: number, ts: string, item: string, titulo: string, estado = 'planejada'): LinhaEvento => ({
  id,
  ts,
  tipo: 'tarefa_planejada',
  origem: 'agente',
  dados: { item, titulo, estado },
})

const mergeada = (id: number, ts: string, item: string): LinhaEvento => ({
  id,
  ts,
  tipo: 'tarefa_mergeada',
  origem: 'agente',
  dados: { item, pr: id },
})

async function abrir(eventos: LinhaEvento[]) {
  const { cliente } = clienteContrato({ linhas: { eventos, sincronizacao: [], posts: [] } })
  const resultado = render(<VisaoGeral cliente={cliente} />)
  await screen.findByRole('table')
  return resultado
}

// O valor de um cartão é o <b> irmão do rótulo.
function valorDoCartao(rotulo: string): string {
  return screen.getByText(rotulo).parentElement?.querySelector('b')?.textContent ?? ''
}

describe('VisaoGeral — acabamento fiel à prévia', () => {
  it('o cartão PRs com merge conta os eventos tarefa_mergeada da noite e não as PRs abertas', async () => {
    await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-001'),
      metricas(2, '2026-11-19T04:00:00Z', 'P-002'),
      metricas(3, '2026-11-19T05:00:00Z', 'P-003'),
      mergeada(4, '2026-11-19T05:30:00Z', 'P-001'),
      mergeada(5, '2026-11-19T06:00:00Z', 'P-002'),
      // fora da noite (mais de 12 h antes do resumo): não conta
      mergeada(6, '2026-11-18T10:00:00Z', 'P-000'),
      RESUMO,
    ])
    expect(screen.getByText('PRs com merge')).toBeInTheDocument()
    expect(valorDoCartao('PRs com merge')).toBe('2')
    expect(screen.queryByText('PRs abertas', { selector: '.numero span' })).not.toBeInTheDocument()
  })

  it('Gasto no mês mostra R$ com custo_usd × 5,40, nunca tokens', async () => {
    await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-001', { perfil: 'api', custo_usd: 1.5 }),
      metricas(2, '2026-11-19T04:00:00Z', 'P-002', { perfil: 'api', custo_usd: 0.5 }),
      RESUMO,
    ])
    const valor = valorDoCartao('Gasto no mês')
    expect(valor).toMatch(/^R\$\s?10,80$/)
    expect(valor).not.toMatch(/token/i)
  })

  it('Gasto no mês mostra R$ 0 no perfil assinatura', async () => {
    await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-001', { perfil: 'assinatura', custo_usd: 0, tokens_entrada: 9_000_000 }),
      RESUMO,
    ])
    const valor = valorDoCartao('Gasto no mês')
    expect(valor).toMatch(/^R\$\s?0(,00)?$/)
    expect(valor).not.toMatch(/token/i)
  })

  it('Tokens na noite aparece com unidade legível (mi, mil)', async () => {
    const { unmount } = await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-001', { tokens_entrada: 9_000_000, tokens_saida: 3_000_000 }),
      RESUMO,
    ])
    expect(valorDoCartao('Tokens na noite')).toBe('12 mi')
    unmount()

    await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-001', { tokens_entrada: 300_000, tokens_saida: 112_000 }),
      RESUMO,
    ])
    expect(valorDoCartao('Tokens na noite')).toBe('412 mil')
  })

  it('item repetido nas tarefa_metricas aparece uma vez, com o estado mais recente', async () => {
    await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-007', { resultado: 'reprovada', tentativas: 1 }),
      metricas(2, '2026-11-19T05:00:00Z', 'P-007', { resultado: 'pr_aberta', tentativas: 2 }),
      metricas(3, '2026-11-19T04:00:00Z', 'P-008'),
      RESUMO,
    ])
    const tabela = screen.getByRole('table')
    expect(within(tabela).getAllByText(/P-007/)).toHaveLength(1)
    const linha = within(tabela).getByText(/P-007/).closest('tr') as HTMLElement
    expect(within(linha).getByText('PR aberta')).toBeInTheDocument()
    expect(within(linha).queryByText('Reprovada')).not.toBeInTheDocument()
    // uma linha de cabeçalho + uma por item distinto
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
  })

  it('a tabela mostra código e título do item; só o código quando falta o título', async () => {
    await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-021'),
      metricas(2, '2026-11-19T04:00:00Z', 'P-022'),
      planejada(3, '2026-11-19T02:00:00Z', 'P-021', 'Calendário de deploys'),
      RESUMO,
    ])
    const tabela = screen.getByRole('table')
    const comTitulo = within(tabela).getByText(/P-021/).closest('tr') as HTMLElement
    expect(comTitulo).toHaveTextContent('P-021')
    expect(comTitulo).toHaveTextContent('Calendário de deploys')
    const semTitulo = within(tabela).getByText(/P-022/).closest('tr') as HTMLElement
    expect(semTitulo).toHaveTextContent('P-022')
    expect(semTitulo).not.toHaveTextContent(/undefined|null/)
  })

  it('cada estado usa o selo certo: Merge feito, PR aberta, Reprovada, Fila de difíceis', async () => {
    await abrir([
      metricas(1, '2026-11-19T01:00:00Z', 'P-031'), // pr_aberta + mergeada
      metricas(2, '2026-11-19T02:00:00Z', 'P-032'), // só pr_aberta
      metricas(3, '2026-11-19T03:00:00Z', 'P-033', { resultado: 'reprovada' }),
      metricas(4, '2026-11-19T04:00:00Z', 'P-034', { resultado: 'reprovada' }),
      mergeada(5, '2026-11-19T05:00:00Z', 'P-031'),
      planejada(6, '2026-11-19T05:30:00Z', 'P-034', 'Item difícil', 'fila_dificeis'),
      RESUMO,
    ])
    const tabela = screen.getByRole('table')
    const selo = (codigo: string) => (within(tabela).getByText(new RegExp(codigo)).closest('tr') as HTMLElement)
    expect(within(selo('P-031')).getByText('Merge feito')).toHaveClass('selo')
    expect(within(selo('P-032')).getByText('PR aberta')).toHaveClass('selo')
    expect(within(selo('P-033')).getByText('Reprovada')).toHaveClass('selo')
    expect(within(selo('P-034')).getByText('Fila de difíceis')).toHaveClass('selo')
  })
})
