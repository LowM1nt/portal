import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamadas, ha, json, montarApp, stubApi } from '../../test/app.ts'
import type { Bug } from './api.ts'

const bug = (b: Partial<Bug> & Pick<Bug, 'id' | 'titulo'>): Bug => ({
  relato: '',
  passos: '',
  esperado: '',
  obtido: '',
  severidade: 'media',
  origem: 'manual',
  status: 'a_triar',
  criadoEm: ha(2),
  atualizadoEm: ha(2),
  ...b,
})

const BUGS: Bug[] = [
  bug({
    id: 'b1',
    titulo: 'Calendário some ao trocar de workspace',
    severidade: 'alta',
    origem: 'discord',
    relato: 'toda vez que eu troco de workspace o calendário fica em branco',
    passos: '1. Abrir o calendário\n2. Trocar de workspace',
    esperado: 'Mostrar os deploys do novo workspace',
    obtido: 'Tela em branco até recarregar',
  }),
  bug({ id: 'b2', titulo: 'Lead time negativo em PRs reabertas', severidade: 'critica', criadoEm: ha(30) }),
  bug({ id: 'b3', titulo: 'Toast não fecha no celular', status: 'em_andamento' }),
  bug({ id: 'b4', titulo: 'Ícone cortado no Firefox', status: 'resolvido', severidade: 'baixa' }),
  bug({ id: 'b5', titulo: 'Duplicado do b1', status: 'descartado' }),
]

const regiao = () => screen.getByRole('region', { name: 'Bugs' })
const linhas = () => within(regiao()).queryAllByTestId('linha-bug')
const contadorBugs = () => screen.queryByTestId('contador-bugs')

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Bugs — quatro estados', () => {
  it('carregando: esqueleto enquanto /api/bugs não responde', async () => {
    stubApi({ 'GET /api/bugs': 'pendente' })
    montarApp('#/bugs')
    await screen.findByRole('heading', { name: 'Bugs', level: 1 })
    await waitFor(() => expect(within(regiao()).getByText('Carregando…')).toBeInTheDocument())
    expect(within(regiao()).queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('erro: explica, avisa num toast e "Tentar de novo" busca outra vez', async () => {
    const f = stubApi({ 'GET /api/bugs': 500 })
    montarApp('#/bugs')
    expect(await screen.findByText('Ops, não deu pra carregar os bugs.')).toBeInTheDocument()
    expect(await screen.findByText('Os bugs não vieram')).toBeInTheDocument()
    f.mockImplementation(async () => json(BUGS))
    fireEvent.click(within(regiao()).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(linhas()).toHaveLength(2))
  })

  it('vazio: frase + botão de relatar', async () => {
    stubApi({ 'GET /api/bugs': [] })
    montarApp('#/bugs')
    expect(await screen.findByText('Nenhum bug esperando triagem')).toBeInTheDocument()
    fireEvent.click(within(regiao()).getByRole('button', { name: 'Relatar bug' }))
    expect(screen.getByRole('dialog', { name: 'Relatar bug' })).toBeInTheDocument()
  })

  it('com dados: abas com contadores e só os bugs da aba atual', async () => {
    stubApi({ 'GET /api/bugs': BUGS })
    montarApp('#/bugs')
    await waitFor(() => expect(linhas()).toHaveLength(2))
    const abas = within(regiao()).getByRole('navigation', { name: 'Status dos bugs' })
    expect(within(abas).getAllByRole('link').map((a) => a.textContent)).toEqual(['A triar2', 'Em andamento1', 'Resolvido2'])
    expect(within(abas).getByRole('link', { name: /A triar/ })).toHaveAttribute('aria-current', 'true')
    expect(within(linhas()[0]).getByText('Alta')).toHaveClass('selo')
    expect(within(linhas()[0]).getByText('Discord')).toBeInTheDocument()
    expect(within(linhas()[1]).getByText('há 1 dia')).toBeInTheDocument()
  })
})

describe('Bugs — ações', () => {
  it('trocar de aba pelo endereço mostra os bugs daquele status (descartado entra em Resolvido)', async () => {
    stubApi({ 'GET /api/bugs': BUGS })
    montarApp('#/bugs?f=resolvido')
    await waitFor(() => expect(linhas()).toHaveLength(2))
    expect(within(regiao()).getByText('Descartado')).toBeInTheDocument()
    expect(within(regiao()).getByRole('link', { name: /Resolvido/ })).toHaveAttribute('aria-current', 'true')
  })

  it('filtro de severidade: só os críticos; filtro sem resultado oferece ver todos', async () => {
    stubApi({ 'GET /api/bugs': BUGS })
    montarApp('#/bugs')
    await waitFor(() => expect(linhas()).toHaveLength(2))
    fireEvent.click(within(regiao()).getByRole('button', { name: 'Crítica' }))
    expect(within(regiao()).getByRole('button', { name: 'Crítica' })).toHaveAttribute('aria-pressed', 'true')
    expect(linhas()).toHaveLength(1)
    expect(linhas()[0]).toHaveTextContent('Lead time negativo')
    fireEvent.click(within(regiao()).getByRole('button', { name: 'Baixa' }))
    expect(screen.getByText('Nada com essa severidade')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as severidades' }))
    expect(linhas()).toHaveLength(2)
  })

  it('detalhe no painel: relato original, passos, esperado × obtido; mover de status chama o PATCH e atualiza o contador', async () => {
    const atualizado = { ...BUGS[0], status: 'em_andamento' }
    const f = stubApi({ 'GET /api/bugs': BUGS, 'PATCH /api/bugs/b1/status': () => json(atualizado) })
    montarApp('#/bugs/b1?f=a_triar')
    const painel = await screen.findByRole('dialog', { name: 'Calendário some ao trocar de workspace' })
    expect(within(painel).getByText('toda vez que eu troco de workspace o calendário fica em branco')).toBeInTheDocument()
    expect(within(painel).getByText(/Abrir o calendário/)).toBeInTheDocument()
    expect(within(painel).getByText('Mostrar os deploys do novo workspace')).toBeInTheDocument()
    expect(within(painel).getByText('Tela em branco até recarregar')).toBeInTheDocument()
    expect(contadorBugs()).toHaveTextContent('2')

    fireEvent.click(within(painel).getByRole('button', { name: 'Começar a resolver' }))
    expect(await screen.findByText('Bora resolver!')).toBeInTheDocument()
    expect(chamadas(f, 'PATCH /api/bugs/b1/status')[0].corpo).toEqual({ status: 'em_andamento' })
    expect(window.location.hash).toBe('#/bugs?f=andamento')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(contadorBugs()).toHaveTextContent('1')
  })

  it('Esc fecha o painel e volta para a lista', async () => {
    stubApi({ 'GET /api/bugs': BUGS })
    montarApp('#/bugs/b1?f=a_triar')
    const painel = await screen.findByRole('dialog')
    fireEvent.keyDown(painel, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/bugs?f=a_triar')
  })

  it('falha ao mover: toast de erro e o painel fica aberto', async () => {
    stubApi({ 'GET /api/bugs': BUGS, 'PATCH /api/bugs/b1/status': 500 })
    montarApp('#/bugs/b1?f=a_triar')
    const painel = await screen.findByRole('dialog')
    fireEvent.click(within(painel).getByRole('button', { name: 'Descartar' }))
    expect(await screen.findByText('Não deu pra mover o bug')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('link para bug que não existe abre um painel explicando', async () => {
    stubApi({ 'GET /api/bugs': BUGS })
    montarApp('#/bugs/nao-existe')
    expect(await screen.findByRole('dialog', { name: 'Esse bug não está aqui' })).toBeInTheDocument()
  })

  it('relatar bug: valida no cliente, faz o POST e o bug entra em "A triar"', async () => {
    const novo = bug({ id: 'b9', titulo: 'Botão salvar some', severidade: 'alta' })
    const f = stubApi({ 'GET /api/bugs': BUGS, 'POST /api/bugs': () => json(novo, 201) })
    montarApp('#/bugs')
    await waitFor(() => expect(linhas()).toHaveLength(2))
    fireEvent.click(screen.getAllByRole('button', { name: 'Relatar bug' })[0])
    const modal = screen.getByRole('dialog', { name: 'Relatar bug' })
    expect(within(modal).getByLabelText('Título')).toHaveFocus()

    fireEvent.click(within(modal).getByRole('button', { name: 'Enviar relato' }))
    expect(within(modal).getByRole('alert')).toHaveTextContent('pelo menos 3 letras')
    expect(chamadas(f, 'POST /api/bugs')).toHaveLength(0)

    fireEvent.change(within(modal).getByLabelText('Título'), { target: { value: '  Botão salvar some  ' } })
    fireEvent.change(within(modal).getByLabelText('Severidade'), { target: { value: 'alta' } })
    fireEvent.change(within(modal).getByLabelText('O que aconteceu?'), { target: { value: 'Cliquei e sumiu' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Enviar relato' }))

    expect(await screen.findByText('Bug relatado!')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/bugs')[0].corpo).toEqual({
      titulo: 'Botão salvar some',
      severidade: 'alta',
      relato: 'Cliquei e sumiu',
      passos: '',
      esperado: '',
      obtido: '',
      origem: 'manual',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(linhas()).toHaveLength(3)
    expect(contadorBugs()).toHaveTextContent('3')
  })

  it('erro de validação do servidor aparece no modal, como texto', async () => {
    stubApi({ 'GET /api/bugs': [], 'POST /api/bugs': () => json({ erro: 'Severidade inválida.' }, 400) })
    montarApp('#/bugs')
    fireEvent.click((await screen.findAllByRole('button', { name: 'Relatar bug' }))[0])
    const modal = screen.getByRole('dialog', { name: 'Relatar bug' })
    fireEvent.change(within(modal).getByLabelText('Título'), { target: { value: 'Algo quebrou' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Enviar relato' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent('Severidade inválida.')
  })

  it('texto vindo do usuário é sempre texto (nada de HTML injetado)', async () => {
    const malicioso = '<img src=x onerror="alert(1)">'
    stubApi({ 'GET /api/bugs': [bug({ id: 'x', titulo: malicioso, relato: malicioso })] })
    montarApp('#/bugs/x')
    const painel = await screen.findByRole('dialog', { name: malicioso })
    expect(within(painel).getAllByText(malicioso).length).toBeGreaterThan(0)
    expect(document.querySelector('img')).toBeNull()
  })
})
