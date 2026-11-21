import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamadas, json, montarApp, stubApi } from '../../test/app.ts'
import type { ItemRoadmap } from './api.ts'
import { montarLinhaDoTempo } from './linhaDoTempo.ts'

const hoje = new Date()
const dia = (deslocamento: number) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + deslocamento)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const item = (i: Partial<ItemRoadmap> & Pick<ItemRoadmap, 'id' | 'titulo'>): ItemRoadmap => ({
  descricao: null,
  status: 'ideia',
  prazo: null,
  progresso: 0,
  deployId: null,
  pullRequestId: null,
  criadoEm: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  atualizadoEm: new Date().toISOString(),
  ...i,
})

const ITENS: ItemRoadmap[] = [
  item({ id: 'r1', titulo: 'Bot de bugs no Slack' }),
  item({ id: 'r2', titulo: 'Notificações por e-mail', status: 'planejado', prazo: dia(30), progresso: 20 }),
  item({ id: 'r3', titulo: 'Triagem com IA', status: 'em_andamento', prazo: dia(-3), progresso: 55, deployId: 'd1' }),
  item({ id: 'r4', titulo: 'Fila de revisão', status: 'entregue', prazo: dia(-20), progresso: 100 }),
]

const regiao = () => screen.getByRole('region', { name: 'Roadmap' })
const coluna = (status: string) => screen.getByTestId(`coluna-${status}`)

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Roadmap — quatro estados', () => {
  it('carregando: esqueleto das colunas', async () => {
    stubApi({ 'GET /api/roadmap': 'pendente' })
    montarApp('#/roadmap')
    await screen.findByRole('heading', { name: 'Roadmap', level: 1 })
    await waitFor(() => expect(within(regiao()).getByText('Carregando…')).toBeInTheDocument())
  })

  it('erro: "Tentar de novo" busca outra vez', async () => {
    const f = stubApi({ 'GET /api/roadmap': 500 })
    montarApp('#/roadmap')
    expect(await screen.findByText('Ops, não deu pra carregar o roadmap.')).toBeInTheDocument()
    f.mockImplementation(async (url: string | URL) => json(String(url).includes('/api/roadmap') ? ITENS : []))
    fireEvent.click(within(regiao()).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findAllByTestId('item-roadmap')).toHaveLength(4)
  })

  it('vazio: frase + "Novo item" abre o painel', async () => {
    stubApi({ 'GET /api/roadmap': [] })
    montarApp('#/roadmap')
    expect(await screen.findByText('Roadmap em branco')).toBeInTheDocument()
    fireEvent.click(within(regiao()).getByRole('button', { name: 'Novo item' }))
    expect(await screen.findByRole('dialog', { name: 'Novo item' })).toBeInTheDocument()
  })

  it('com dados: quadro por status, com progresso, prazo, atraso e "Entregue"', async () => {
    stubApi({ 'GET /api/roadmap': ITENS })
    montarApp('#/roadmap')
    await screen.findAllByTestId('item-roadmap')
    expect(coluna('ideia')).toHaveAccessibleName('Ideias: 1')
    expect(within(coluna('ideia')).getByText('Sem prazo')).toBeInTheDocument()
    expect(within(coluna('ideia')).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(coluna('planejado')).getByRole('progressbar', { name: 'Progresso de Notificações por e-mail' })).toHaveAttribute('aria-valuenow', '20')
    expect(within(coluna('em_andamento')).getByText(/^Venceu /)).toBeInTheDocument()
    expect(within(coluna('em_andamento')).getByText('55%')).toBeInTheDocument()
    expect(within(coluna('entregue')).getByText('Entregue', { selector: '.selo' })).toBeInTheDocument()
  })
})

describe('Roadmap — linha do tempo', () => {
  it('?v=tempo mostra uma barra por item com prazo e avisa dos itens sem prazo', async () => {
    stubApi({ 'GET /api/roadmap': ITENS })
    montarApp('#/roadmap?v=tempo')
    expect(await screen.findAllByTestId('barra-roadmap')).toHaveLength(3)
    expect(screen.getByText('1 item sem prazo fica só no quadro.')).toBeInTheDocument()
    expect(within(regiao()).getByRole('link', { name: 'Linha do tempo' })).toHaveAttribute('aria-current', 'true')
  })

  it('sem nenhum prazo: estado vazio com atalho pro quadro', async () => {
    stubApi({ 'GET /api/roadmap': [ITENS[0]] })
    montarApp('#/roadmap?v=tempo')
    expect(await screen.findByText('Nenhum item com prazo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver o quadro' })).toHaveAttribute('href', '#/roadmap')
  })

  it('montarLinhaDoTempo: janela de 4 a 12 meses, barras dentro de 0–100% e "hoje" marcado', () => {
    const ref = new Date(2026, 10, 21)
    const lt = montarLinhaDoTempo(
      [
        item({ id: 'a', titulo: 'A', prazo: '2026-12-10', criadoEm: '2026-11-01T10:00:00Z' }),
        item({ id: 'b', titulo: 'B', prazo: '2029-01-01', criadoEm: '2026-11-01T10:00:00Z' }),
        item({ id: 'c', titulo: 'C' }),
      ],
      ref,
    )
    expect(lt.meses[0].rotulo).toBe('Nov')
    expect(lt.meses).toHaveLength(12)
    expect(lt.meses.at(-1)?.rotulo).toBe('Out/27')
    expect(lt.semPrazo.map((i) => i.id)).toEqual(['c'])
    for (const b of lt.barras) {
      expect(b.esquerda).toBeGreaterThanOrEqual(0)
      expect(b.esquerda + b.largura).toBeLessThanOrEqual(100.0001)
    }
    expect(lt.barras.map((b) => b.item.id)).toEqual(['a', 'b'])
    expect(lt.hoje).toBeGreaterThan(0)
    expect(montarLinhaDoTempo([item({ id: 'c', titulo: 'C' })], ref).barras).toHaveLength(0)
  })
})

describe('Roadmap — criar, editar e mover', () => {
  it('criar: valida o título, faz o POST e o item aparece na coluna', async () => {
    const criado = item({ id: 'r9', titulo: 'Exportar .ics', status: 'planejado', prazo: dia(10), progresso: 10 })
    const f = stubApi({ 'GET /api/roadmap': ITENS, 'POST /api/roadmap': () => json(criado, 201) })
    montarApp('#/roadmap')
    await screen.findAllByTestId('item-roadmap')
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo item' })[0])
    const painel = await screen.findByRole('dialog', { name: 'Novo item' })
    fireEvent.click(within(painel).getByRole('button', { name: 'Criar item' }))
    expect(within(painel).getByRole('alert')).toHaveTextContent('Dá um título pro item.')
    expect(chamadas(f, 'POST /api/roadmap')).toHaveLength(0)

    fireEvent.change(within(painel).getByLabelText('Título'), { target: { value: 'Exportar .ics' } })
    fireEvent.change(within(painel).getByLabelText('Status'), { target: { value: 'planejado' } })
    fireEvent.change(within(painel).getByLabelText('Prazo'), { target: { value: dia(10) } })
    fireEvent.change(within(painel).getByLabelText('Progresso'), { target: { value: '10' } })
    fireEvent.click(within(painel).getByRole('button', { name: 'Criar item' }))

    expect(await screen.findByText('Item criado!')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/roadmap')[0].corpo).toEqual({
      titulo: 'Exportar .ics',
      descricao: null,
      status: 'planejado',
      prazo: dia(10),
      progresso: 10,
      deployId: null,
      pullRequestId: null,
    })
    expect(within(coluna('planejado')).getByText('Exportar .ics')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/roadmap')
  })

  it('editar e mover: PUT mantém a ligação com o deploy e o PATCH muda o status', async () => {
    const editado = { ...ITENS[2], titulo: 'Triagem de bugs com IA' }
    const movido = { ...editado, status: 'entregue', progresso: 100 }
    const f = stubApi({
      'GET /api/roadmap': ITENS,
      'PUT /api/roadmap/r3': () => json(editado),
      'PATCH /api/roadmap/r3/status': () => json(movido),
    })
    montarApp('#/roadmap/r3')
    const painel = await screen.findByRole('dialog', { name: 'Editar item' })
    expect(within(painel).getByLabelText('Título')).toHaveValue('Triagem com IA')
    fireEvent.change(within(painel).getByLabelText('Título'), { target: { value: 'Triagem de bugs com IA' } })
    fireEvent.change(within(painel).getByLabelText('Status'), { target: { value: 'entregue' } })
    fireEvent.click(within(painel).getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Item salvo')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/roadmap/r3')[0].corpo).toMatchObject({ titulo: 'Triagem de bugs com IA', deployId: 'd1' })
    expect(chamadas(f, 'PATCH /api/roadmap/r3/status')[0].corpo).toEqual({ status: 'entregue' })
    expect(within(coluna('entregue')).getByText('Triagem de bugs com IA')).toBeInTheDocument()
    expect(within(coluna('em_andamento')).queryByText('Triagem de bugs com IA')).not.toBeInTheDocument()
  })

  it('se só o PATCH falhar, o painel fica aberto e explica', async () => {
    stubApi({
      'GET /api/roadmap': ITENS,
      'PUT /api/roadmap/r1': () => json(ITENS[0]),
      'PATCH /api/roadmap/r1/status': 500,
    })
    montarApp('#/roadmap/r1')
    const painel = await screen.findByRole('dialog', { name: 'Editar item' })
    fireEvent.change(within(painel).getByLabelText('Status'), { target: { value: 'planejado' } })
    fireEvent.click(within(painel).getByRole('button', { name: 'Salvar' }))
    expect(await within(painel).findByRole('alert')).toHaveTextContent('continua em Ideia')
  })
})
