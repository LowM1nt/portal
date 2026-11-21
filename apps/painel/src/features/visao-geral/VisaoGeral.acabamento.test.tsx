import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import VisaoGeral from './VisaoGeral.tsx'
import { clienteContrato, type LinhaEvento } from '../../test/clienteContrato.ts'

const RESUMO: LinhaEvento = {
  id: 100,
  ts: '2026-11-19T07:00:00Z',
  tipo: 'noite_resumo',
  origem: 'agente',
  dados: { prs: 3, reprovadas: 0, fila_dificeis: 0, fallbacks: 0, quedas: 0, minutos_fora: 0, perfil: 'principal' },
}

const metricas = (id: number, ts: string, item: string, extra: Record<string, unknown> = {}): LinhaEvento => ({
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
})

const mergeada = (id: number, ts: string, item: string): LinhaEvento => ({
  id,
  ts,
  tipo: 'tarefa_mergeada',
  origem: 'agente',
  dados: { item, pr: id },
})

const TEXTO_LONGO = Array.from({ length: 40 }, (_, i) => `Frase número ${i} do post longo.`).join(' ')

async function abrir(eventos: LinhaEvento[], posts: Record<string, unknown>[] = []) {
  const c = clienteContrato({ linhas: { eventos, sincronizacao: [], posts } })
  const resultado = render(<VisaoGeral cliente={c.cliente} />)
  await screen.findByRole('table')
  return { ...resultado, ...c }
}

const post = (texto: string) => ({ id: 1, texto, publicar_em: '2099-01-01T12:00:00Z' })

describe('VisaoGeral — acabamento (P-019)', () => {
  it('mostra o código em negrito seguido do título de tarefa_metricas; sem título, só o código', async () => {
    await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-021', { titulo: 'Calendário de deploys' }),
      metricas(2, '2026-11-19T04:00:00Z', 'P-022'),
      RESUMO,
    ])
    const tabela = screen.getByRole('table')
    const comTitulo = within(tabela).getByText('P-021').closest('tr') as HTMLElement
    expect(within(comTitulo).getByText('P-021').tagName).toBe('B')
    expect(comTitulo).toHaveTextContent('P-021 Calendário de deploys')
    const semTitulo = within(tabela).getByText('P-022').closest('tr') as HTMLElement
    expect(within(semTitulo).getByText('P-022').tagName).toBe('B')
    expect(semTitulo.querySelector('td')).toHaveTextContent(/^P-022$/)
  })

  it('a coluna principal da tabela não mostra a hora', async () => {
    await abrir([metricas(1, '2026-11-19T03:00:00Z', 'P-021', { titulo: 'Calendário' }), RESUMO])
    const celula = within(screen.getByRole('table')).getByText('P-021').closest('td') as HTMLElement
    expect(celula.textContent).not.toMatch(/\d{1,2}h\d{2}|\d{1,2}:\d{2}/)
  })

  it('o subtítulo da noite usa a contagem de merge e coincide com o cartão', async () => {
    const { container } = await abrir([
      metricas(1, '2026-11-19T03:00:00Z', 'P-001'),
      metricas(2, '2026-11-19T04:00:00Z', 'P-002'),
      metricas(3, '2026-11-19T05:00:00Z', 'P-003'),
      mergeada(4, '2026-11-19T05:30:00Z', 'P-001'),
      RESUMO, // prs: 3, mas só 1 merge
    ])
    const cartao = screen.getByText('PRs com merge').parentElement?.querySelector('b')?.textContent
    expect(cartao).toBe('1')
    const subtitulo = container.querySelector('.cabecalho .titulo') as HTMLElement
    expect(subtitulo).not.toHaveTextContent(/PRs? abertas?/)
    expect(subtitulo).toHaveTextContent(/\b1\b/)
    expect(subtitulo).not.toHaveTextContent(/\b3\b/)
  })

  it('Próximo post com texto longo mostra "Ler inteiro"; clicar expande', async () => {
    const usuario = userEvent.setup()
    await abrir([metricas(1, '2026-11-19T03:00:00Z', 'P-001'), RESUMO], [post(TEXTO_LONGO)])
    const secao = screen.getByRole('region', { name: 'Próximo post' })
    const botao = within(secao).getByRole('button', { name: 'Ler inteiro' })
    await usuario.click(botao)
    expect(secao).toHaveTextContent(TEXTO_LONGO)
    expect(within(secao).queryByRole('button', { name: 'Ler inteiro' })).not.toBeInTheDocument()
  })

  it('Próximo post com texto curto não mostra "Ler inteiro"', async () => {
    await abrir([metricas(1, '2026-11-19T03:00:00Z', 'P-001'), RESUMO], [post('Texto curto.')])
    const secao = screen.getByRole('region', { name: 'Próximo post' })
    expect(secao).toHaveTextContent('Texto curto.')
    expect(within(secao).queryByRole('button', { name: 'Ler inteiro' })).not.toBeInTheDocument()
  })

  it('Cancelar post usa .botao com variante e grava cancelar_post em comandos', async () => {
    const usuario = userEvent.setup()
    const { inserts } = await abrir([metricas(1, '2026-11-19T03:00:00Z', 'P-001'), RESUMO], [post('Texto curto.')])
    const botao = screen.getByRole('button', { name: 'Cancelar post' })
    expect(botao).toHaveClass('botao')
    expect(botao.className.split(/\s+/).filter((c) => c.startsWith('botao-')).length).toBeGreaterThan(0)
    await usuario.click(botao)
    expect(inserts).toHaveLength(0) // antes, a confirmação
    await usuario.click(screen.getByRole('button', { name: 'Sim, cancelar post' }))
    expect(inserts).toEqual([{ tabela: 'comandos', valor: { comando: 'cancelar_post' } }])
  })

  it('estado de erro mostra "Tentar de novo"', async () => {
    const { cliente } = clienteContrato({ erro: true })
    render(<VisaoGeral cliente={cliente} />)
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('estado vazio e carregando continuam funcionando', async () => {
    const vazio = clienteContrato({ linhas: { eventos: [], sincronizacao: [], posts: [] } })
    const { unmount } = render(<VisaoGeral cliente={vazio.cliente} />)
    expect(screen.getByText(/Carregando/)).toBeInTheDocument()
    expect(await screen.findByText(/Nenhuma atividade/)).toBeInTheDocument()
    unmount()
  })
})
