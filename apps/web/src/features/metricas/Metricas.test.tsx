import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamadas, json, montarApp, stubApi } from '../../test/app.ts'
import { caminhoSuave, trechos } from './curva.ts'
import { descreverVariacao, formatarDuracao, formatarFrequencia, formatarTaxa, periodoDaRota, type Metricas } from './formato.ts'

const semana = (i: number, extra: Partial<Metricas['series'][number]> = {}) => ({
  inicio: new Date(Date.UTC(2026, 9, 5 + i * 7)).toISOString(),
  fim: new Date(Date.UTC(2026, 9, 12 + i * 7)).toISOString(),
  deploys: 0,
  falhas: 0,
  taxaDeFalha: null,
  tempoAteDeployHoras: null,
  tempoParaRecuperarHoras: null,
  ...extra,
})

const metricas = (series = [0, 1, 2, 3].map((i) => semana(i)), resto: Partial<Metricas> = {}): Metricas => ({
  semanas: 4,
  inicio: series[0].inicio,
  fim: series[series.length - 1].fim,
  deploysPorDia: { valor: 0, anterior: 0, variacao: null },
  tempoAteDeployHoras: { valor: null, anterior: null, variacao: null },
  taxaDeFalha: { valor: null, anterior: null, variacao: null },
  tempoParaRecuperarHoras: { valor: null, anterior: null, variacao: null },
  series,
  ...resto,
})

const COM_DADOS = metricas(
  [
    semana(0, { deploys: 3, tempoAteDeployHoras: 30, taxaDeFalha: 0 }),
    semana(1, { deploys: 5, falhas: 1, tempoAteDeployHoras: 50, taxaDeFalha: 16.7 }),
    semana(2),
    semana(3, { deploys: 7, tempoAteDeployHoras: 40, taxaDeFalha: 0 }),
  ],
  {
    deploysPorDia: { valor: 2.14, anterior: 1.9, variacao: 12.5 },
    tempoAteDeployHoras: { valor: 43.2, anterior: 40, variacao: 8 },
    taxaDeFalha: { valor: 6.25, anterior: 8, variacao: -21.9 },
    tempoParaRecuperarHoras: { valor: null, anterior: null, variacao: null },
  },
)

const numero = (rotulo: string) => screen.getByText(rotulo, { selector: 'small' }).closest('.numero') as HTMLElement

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Métricas', () => {
  it('carregando: esqueleto enquanto a API calcula', async () => {
    stubApi({ 'GET /api/metricas': 'pendente' })
    montarApp('#/metricas')
    await screen.findByRole('heading', { level: 1, name: 'Métricas' })
    await waitFor(() => expect(screen.getByText('Carregando…')).toBeInTheDocument())
  })

  it('erro: explica e "Tentar de novo" busca de novo', async () => {
    const f = stubApi({ 'GET /api/metricas': 500 })
    montarApp('#/metricas')
    expect(await screen.findByText('Ops, não deu pra calcular as métricas.')).toBeInTheDocument()
    f.mockImplementation(async (url: string | URL) => json(String(url).includes('/api/metricas') ? COM_DADOS : { workspaces: [{ id: 'w1', nome: 'Acme', papel: 'dono' }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Frequência de deploy')).toBeInTheDocument()
  })

  it('vazio: sem deploy marcado, diz como passar a ter dados', async () => {
    stubApi({ 'GET /api/metricas': metricas() })
    montarApp('#/metricas')
    expect(await screen.findByText('Ainda sem dados suficientes')).toBeInTheDocument()
    expect(screen.getByText(/marque como foi/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para Deploys' })).toHaveAttribute('href', '#/deploys')
  })

  it('com dados: 4 números com variação (boa em verde, ruim em rosa) e nulo vira "Ainda sem dados suficientes"', async () => {
    stubApi({ 'GET /api/metricas': COM_DADOS })
    montarApp('#/metricas')
    await screen.findByText('Frequência de deploy')
    expect(within(numero('Frequência de deploy')).getByText('2,1/dia')).toBeInTheDocument()
    expect(within(numero('Frequência de deploy')).getByText('+12,5% vs. anterior')).toHaveClass('variacao-melhor')
    expect(within(numero('Tempo até o deploy')).getByText('43,2 h')).toBeInTheDocument()
    expect(within(numero('Tempo até o deploy')).getByText('+8% vs. anterior')).toHaveClass('variacao-pior')
    expect(within(numero('Taxa de falha')).getByText('6,3%')).toBeInTheDocument()
    expect(within(numero('Taxa de falha')).getByText('−21,9% vs. anterior')).toHaveClass('variacao-melhor')
    const recuperar = numero('Tempo para recuperar')
    expect(within(recuperar).getByText('—')).toBeInTheDocument()
    expect(within(recuperar).getByText('Ainda sem dados suficientes')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Como passar a ter dados' })).toHaveTextContent(/seguido por um concluído no mesmo repositório/)
  })

  it('gráficos em SVG próprio: quatro, com descrição para leitor de tela e vão na semana sem amostra', async () => {
    stubApi({ 'GET /api/metricas': COM_DADOS })
    montarApp('#/metricas')
    await screen.findByText('Frequência de deploy')
    const graficos = within(document.querySelector('.graficos') as HTMLElement).getAllByRole('img')
    expect(graficos).toHaveLength(4)
    expect(graficos[0]).toHaveAccessibleName(/Deploys concluídos por semana: 4 de 4 semanas com dados; a última com dados, 7/)
    expect(graficos[1]).toHaveAccessibleName(/3 de 4 semanas com dados/)
    expect(graficos[3]).toHaveAccessibleName('Tempo para recuperar por semana: sem dados no período.')
    // A semana sem amostra quebra a linha do tempo até o deploy em dois trechos.
    expect(graficos[1].querySelectorAll('path.grafico-linha')).toHaveLength(2)
  })

  it('período: 12 semanas por padrão; ?p=4 pede semanas=4 e marca a opção', async () => {
    const f = stubApi({ 'GET /api/metricas': COM_DADOS })
    montarApp('#/metricas')
    await screen.findByText('Frequência de deploy')
    expect(chamadas(f, 'GET /api/metricas')[0].url).toContain('semanas=12')
    expect(screen.getByRole('link', { name: '12 semanas' })).toHaveAttribute('aria-current', 'true')

    window.history.replaceState(null, '', '/#/metricas?p=4')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(chamadas(f, 'GET /api/metricas').some((c) => c.url.includes('semanas=4'))).toBe(true))
    expect(screen.getByRole('link', { name: '4 semanas' })).toHaveAttribute('aria-current', 'true')
  })
})

describe('Métricas — formatos e curva', () => {
  it('duração, frequência e taxa em pt-BR', () => {
    expect(formatarDuracao(0.5)).toBe('30 min')
    expect(formatarDuracao(0.001)).toBe('1 min')
    expect(formatarDuracao(5.5)).toBe('5,5 h')
    expect(formatarDuracao(60)).toBe('2,5 d')
    expect(formatarFrequencia(2.14)).toBe('2,1/dia')
    expect(formatarFrequencia(0.5)).toBe('3,5/semana')
    expect(formatarFrequencia(0)).toBe('0/semana')
    expect(formatarTaxa(6.25)).toBe('6,3%')
  })

  it('variação: nula sem comparação; subir é bom só na frequência', () => {
    expect(descreverVariacao(null, true)).toBeNull()
    expect(descreverVariacao(0, true)).toEqual({ texto: 'Igual ao anterior', tendencia: 'igual' })
    expect(descreverVariacao(10, true)?.tendencia).toBe('melhor')
    expect(descreverVariacao(10, false)?.tendencia).toBe('pior')
  })

  it('período da rota: só 4 ou 12', () => {
    expect(periodoDaRota(new URLSearchParams('p=4'))).toBe(4)
    expect(periodoDaRota(new URLSearchParams('p=7'))).toBe(12)
    expect(periodoDaRota(new URLSearchParams())).toBe(12)
  })

  it('trechos quebram no nulo e a curva passa por todos os pontos', () => {
    expect(trechos([1, null, 2, 3]).map((t) => t.map((p) => p.valor))).toEqual([[1], [2, 3]])
    expect(trechos([null, null])).toEqual([])
    expect(caminhoSuave([{ x: 0, y: 10 }, { x: 10, y: 0 }])).toBe('M0,10 C5,10 5,0 10,0')
  })
})
