import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamadas, ha, json, montarApp, stubApi } from '../../test/app.ts'
import type { Bug } from '../bugs/api.ts'
import type { ItemTriagem, Sugestao } from './api.ts'

const sugestao = (s: Partial<Sugestao> = {}): Sugestao => ({
  status: 'pronta',
  severidade: 'alta',
  area: 'Front · calendário',
  passos: '1. Abrir o calendário\n2. Trocar de workspace',
  esperado: 'Ver os deploys do outro workspace',
  obtido: 'Tela em branco',
  ambiente: 'Chrome no Windows',
  confianca: 86,
  evidencias: ['Relato cita F5 resolvendo', 'Acontece só ao trocar de workspace'],
  erro: null,
  ...s,
})

const item = (i: Partial<ItemTriagem> & Pick<ItemTriagem, 'bugId' | 'titulo'>): ItemTriagem => ({
  relato: '',
  origem: 'discord',
  autor: 'Rafa Melo',
  severidade: 'media',
  criadoEm: ha(2),
  sugestao: null,
  possivelDuplicado: null,
  ...i,
})

const bug = (b: Partial<Bug> & Pick<Bug, 'id' | 'titulo'>): Bug => ({
  relato: '',
  passos: '',
  esperado: '',
  obtido: '',
  severidade: 'media',
  origem: 'discord',
  status: 'a_triar',
  criadoEm: ha(2),
  atualizadoEm: ha(2),
  autor: 'Rafa Melo',
  ...b,
})

const FILA: ItemTriagem[] = [
  item({
    bugId: 'b1',
    titulo: 'Calendário some ao trocar de workspace',
    relato: 'toda vez que troco de workspace o calendário fica em branco <img src=x onerror=alert(1)>',
    sugestao: sugestao(),
    possivelDuplicado: { bugId: 'b9', titulo: 'Calendário vazio depois de trocar o time', similaridade: 78 },
  }),
  item({ bugId: 'b2', titulo: 'Toast não fecha no celular', origem: 'manual', autor: null, sugestao: sugestao({ status: 'pendente', severidade: null, confianca: null, evidencias: [] }) }),
]
const BUGS = [bug({ id: 'b1', titulo: FILA[0].titulo }), bug({ id: 'b2', titulo: FILA[1].titulo, origem: 'manual', autor: null })]
const IA_LIGADA = { configurado: true, provedor: 'gemini' }

const cartoes = () => screen.queryAllByTestId('cartao-triagem')
const cartao = (titulo: string) => cartoes().find((c) => within(c).queryByRole('link', { name: titulo }))!

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Triagem com IA — quatro estados', () => {
  it('carregando: esqueleto enquanto a fila não chega', async () => {
    stubApi({ 'GET /api/triagem': 'pendente' })
    montarApp('#/triagem')
    expect(await screen.findByRole('heading', { level: 1, name: 'Triagem com IA' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Carregando…')).toBeInTheDocument())
    expect(cartoes()).toHaveLength(0)
  })

  it('erro: explica, avisa e "Tentar de novo" busca outra vez', async () => {
    const f = stubApi({ 'GET /api/triagem': 500 })
    montarApp('#/triagem')
    expect(await screen.findByText('Ops, não deu pra carregar a triagem.')).toBeInTheDocument()
    expect(await screen.findByText('A triagem não veio')).toBeInTheDocument()
    f.mockImplementation(async (url: string | URL) => {
      const p = new URL(String(url), 'http://teste').pathname
      if (p === '/api/me') return json({ workspaces: [{ id: 'w1', nome: 'Acme', papel: 'dono' }] })
      return json(p === '/api/triagem' ? FILA : p === '/api/integracoes/ia' ? IA_LIGADA : [])
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(cartoes()).toHaveLength(2))
  })

  it('vazio: "Fila zerada!" com atalho pros bugs', async () => {
    stubApi({ 'GET /api/triagem': [] })
    montarApp('#/triagem')
    expect(await screen.findByText('Fila zerada!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver bugs' })).toHaveAttribute('href', '#/bugs')
  })

  it('com dados: deixa claro que a IA só sugere e mostra severidade, área, confiança, evidências e duplicado', async () => {
    stubApi({ 'GET /api/triagem': FILA, 'GET /api/integracoes/ia': IA_LIGADA })
    montarApp('#/triagem')
    expect(await screen.findByText('A IA sugere; você decide. Nada muda sem a sua aprovação.')).toBeInTheDocument()
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    const c = cartao('Calendário some ao trocar de workspace')
    expect(within(c).getByText(/Discord · Rafa Melo/)).toBeInTheDocument()
    expect(within(c).getByText('Sugestão da IA')).toBeInTheDocument()
    expect(within(c).getByText('Alta')).toBeInTheDocument()
    expect(within(c).getByText('Front · calendário')).toBeInTheDocument()
    expect(within(c).getByRole('meter', { name: 'Confiança da IA' })).toHaveAttribute('aria-valuenow', '86')
    expect(within(c).getByText('86%')).toBeInTheDocument()
    expect(within(c).getByText('Relato cita F5 resolvendo')).toBeInTheDocument()
    expect(within(c).getByRole('link', { name: 'Calendário vazio depois de trocar o time' })).toHaveAttribute('href', '#/bugs/b9?f=a_triar')
    expect(within(c).getByText('78% parecido')).toBeInTheDocument()
    // Relato do Discord é texto: nada de HTML injetado.
    expect(within(c).getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
    expect(c.querySelector('img')).toBeNull()
    expect(within(c).getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Ajustar' })).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Descartar sugestão' })).toBeInTheDocument()
  })

  it('sem sugestão ainda: "A IA está lendo esse relato…" e só dá pra ajustar', async () => {
    stubApi({ 'GET /api/triagem': FILA, 'GET /api/integracoes/ia': IA_LIGADA })
    montarApp('#/triagem')
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    const c = cartao('Toast não fecha no celular')
    expect(within(c).getByRole('status')).toHaveTextContent('A IA está lendo esse relato…')
    expect(within(c).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(within(c).queryByRole('button', { name: 'Descartar sugestão' })).not.toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Ajustar' })).toHaveClass('botao-primario')
  })

  it('sem chave de IA: explica e leva pras Configurações', async () => {
    stubApi({ 'GET /api/triagem': [item({ bugId: 'b3', titulo: 'Sem IA aqui' })] })
    montarApp('#/triagem')
    expect(await screen.findByText(/Sem chave de IA configurada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ligar a IA em Configurações' })).toHaveAttribute('href', '#/config/repositorios')
  })

  it('falhou: mostra o motivo como texto e deixa descartar', async () => {
    stubApi({
      'GET /api/triagem': [item({ bugId: 'b4', titulo: 'Relato estranho', sugestao: sugestao({ status: 'falhou', erro: 'A resposta da IA veio fora do formato.' }) })],
      'GET /api/integracoes/ia': IA_LIGADA,
    })
    montarApp('#/triagem')
    expect(await screen.findByText('A IA não conseguiu ler esse relato.')).toBeInTheDocument()
    expect(screen.getByText('A resposta da IA veio fora do formato.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descartar sugestão' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
  })

  it('enquanto a IA lê, a fila se atualiza sozinha', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const f = stubApi({ 'GET /api/triagem': FILA, 'GET /api/integracoes/ia': IA_LIGADA })
    montarApp('#/triagem')
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    const antes = chamadas(f, 'GET /api/triagem').length
    await vi.advanceTimersByTimeAsync(15_000)
    await waitFor(() => expect(chamadas(f, 'GET /api/triagem').length).toBeGreaterThan(antes))
  })
})

describe('Triagem com IA — ações', () => {
  it('aprovar: manda o POST, tira da fila, avisa e "Desfazer" devolve o bug pra triagem', async () => {
    const f = stubApi({
      'GET /api/triagem': FILA,
      'GET /api/integracoes/ia': IA_LIGADA,
      'GET /api/bugs': BUGS,
      'POST /api/triagem/b1': () =>
        json({ bug: { ...BUGS[0], severidade: 'alta', status: 'em_andamento' }, sugestao: sugestao({ status: 'aprovada' }) }),
      'PATCH /api/bugs/b1/status': () => json({ ...BUGS[0], severidade: 'alta', status: 'a_triar' }),
    })
    montarApp('#/triagem')
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    await waitFor(() => expect(screen.getByTestId('contador-triagem')).toHaveTextContent('2'))
    fireEvent.click(within(cartao('Calendário some ao trocar de workspace')).getByRole('button', { name: 'Aprovar' }))
    expect(await screen.findByText('Sugestão aprovada!')).toBeInTheDocument()
    expect(screen.getByText('“Calendário some ao trocar de workspace” foi pra Em andamento como Alta.')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/triagem/b1')[0].corpo).toEqual({ acao: 'aprovar' })
    expect(cartoes()).toHaveLength(1)
    await waitFor(() => expect(screen.getByTestId('contador-triagem')).toHaveTextContent('1'))

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(await screen.findByText('Voltou pra fila')).toBeInTheDocument()
    expect(chamadas(f, 'PATCH /api/bugs/b1/status')[0].corpo).toEqual({ status: 'a_triar' })
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    await waitFor(() => expect(screen.getByTestId('contador-triagem')).toHaveTextContent('2'))
  })

  it('ajustar: escolhe a severidade no modal e manda junto', async () => {
    const f = stubApi({
      'GET /api/triagem': FILA,
      'GET /api/integracoes/ia': IA_LIGADA,
      'POST /api/triagem/b1': () => json({ bug: { ...BUGS[0], severidade: 'critica', status: 'em_andamento' }, sugestao: sugestao({ status: 'ajustada' }) }),
    })
    montarApp('#/triagem')
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    fireEvent.click(within(cartao('Calendário some ao trocar de workspace')).getByRole('button', { name: 'Ajustar' }))
    const modal = screen.getByRole('dialog', { name: 'Ajustar a triagem' })
    // Começa na severidade que a IA sugeriu.
    expect(within(modal).getByLabelText('Severidade')).toHaveValue('alta')
    fireEvent.change(within(modal).getByLabelText('Severidade'), { target: { value: 'critica' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar severidade' }))
    expect(await screen.findByText('Triagem ajustada!')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/triagem/b1')[0].corpo).toEqual({ acao: 'ajustar', severidade: 'critica' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cartoes()).toHaveLength(1)
  })

  it('descartar: a sugestão sai, o bug fica na fila esperando a sua severidade', async () => {
    const f = stubApi({
      'GET /api/triagem': FILA,
      'GET /api/integracoes/ia': IA_LIGADA,
      'POST /api/triagem/b1': () => json({ bug: BUGS[0], sugestao: sugestao({ status: 'descartada' }) }),
    })
    montarApp('#/triagem')
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    fireEvent.click(within(cartao('Calendário some ao trocar de workspace')).getByRole('button', { name: 'Descartar sugestão' }))
    expect(await screen.findByText('Sugestão descartada')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/triagem/b1')[0].corpo).toEqual({ acao: 'descartar' })
    const c = cartao('Calendário some ao trocar de workspace')
    expect(within(c).getByText(/Você descartou a sugestão/)).toBeInTheDocument()
    expect(within(c).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(cartoes()).toHaveLength(2)
  })

  it('alguém triou antes (409): avisa com a mensagem da API e busca a fila de novo', async () => {
    const f = stubApi({
      'GET /api/triagem': FILA,
      'GET /api/integracoes/ia': IA_LIGADA,
      'POST /api/triagem/b1': () => json({ erro: 'Este bug já foi triado.' }, 409),
    })
    montarApp('#/triagem')
    await waitFor(() => expect(cartoes()).toHaveLength(2))
    const antes = chamadas(f, 'GET /api/triagem').length
    fireEvent.click(within(cartao('Calendário some ao trocar de workspace')).getByRole('button', { name: 'Aprovar' }))
    expect(await screen.findByText('Esse bug mudou')).toBeInTheDocument()
    expect(screen.getByText('Este bug já foi triado.')).toBeInTheDocument()
    await waitFor(() => expect(chamadas(f, 'GET /api/triagem').length).toBeGreaterThan(antes))
  })
})

describe('Triagem com IA — navegação', () => {
  it('no dock com contador e no "Mais" do celular', async () => {
    stubApi({ 'GET /api/bugs': BUGS })
    montarApp('#/mais')
    const link = await screen.findByRole('link', { name: /Triagem com IA/, description: '2 bugs esperando triagem' })
    expect(link).toHaveAttribute('href', '#/triagem')
    const mais = screen.getByRole('region', { name: 'Mais opções' })
    expect(within(mais).getByRole('link', { name: /Triagem com IA/ })).toHaveAttribute('href', '#/triagem')
    expect(within(mais).getByTestId('mais-contador-triagem')).toHaveTextContent('2')
  })
})
