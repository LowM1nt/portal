import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamadas, json, montarApp, stubApi } from '../../test/app.ts'
import { rotuloSemana } from '../calendario/semana.ts'

const REPOS = [
  { id: 'r1', nome: 'acme/api' },
  { id: 'r2', nome: 'acme/portal' },
]
const hojeUtc = (hora: number) => {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hora)).toISOString()
}
const D1 = { id: 'd1', repositorioId: 'r2', titulo: 'Filtro por ambiente', ambiente: 'producao', status: 'agendado', agendadoPara: hojeUtc(15) }
const ESTA_SEMANA = rotuloSemana(new Date())

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Novo deploy', () => {
  it('abre pelo botão de Deploys, valida o título, cria e o calendário busca de novo', async () => {
    let criado = false
    const f = stubApi({
      'GET /api/repositorios': REPOS,
      'GET /api/deploys': (_: RequestInit | undefined, url: URL) => json(criado && url.searchParams.get('semana') === ESTA_SEMANA ? [D1] : []),
      'POST /api/deploys': (init: RequestInit | undefined) => {
        criado = true
        const corpo = JSON.parse(String(init?.body))
        return json({ ...D1, ...corpo, id: 'd1', status: 'agendado' }, 201)
      },
    })
    montarApp('#/deploys')
    await screen.findByText('Nenhum deploy nesta semana')
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo deploy' })[0])
    const painel = await screen.findByRole('dialog', { name: 'Novo deploy' })
    const repo = await within(painel).findByLabelText('Repositório')
    expect(within(repo).getAllByRole('option').map((o) => o.textContent)).toEqual(['acme/api', 'acme/portal'])

    fireEvent.click(within(painel).getByRole('button', { name: 'Criar deploy' }))
    expect(within(painel).getByRole('alert')).toHaveTextContent('Dá um título pro deploy')
    expect(chamadas(f, 'POST /api/deploys')).toHaveLength(0)

    fireEvent.change(within(painel).getByLabelText('Título'), { target: { value: '  Filtro por ambiente ' } })
    fireEvent.change(repo, { target: { value: 'r2' } })
    fireEvent.change(within(painel).getByLabelText('Dia'), { target: { value: '2026-11-27' } })
    fireEvent.change(within(painel).getByLabelText('Hora'), { target: { value: '15:00' } })
    fireEvent.change(within(painel).getByLabelText('Ambiente'), { target: { value: 'homologacao' } })
    fireEvent.click(within(painel).getByRole('button', { name: 'Criar deploy' }))

    expect(await screen.findByText('Deploy criado!')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/deploys')[0].corpo).toEqual({
      repositorioId: 'r2',
      titulo: 'Filtro por ambiente',
      ambiente: 'homologacao',
      agendadoPara: '2026-11-27T15:00:00Z',
    })
    expect(screen.queryByRole('dialog', { name: 'Novo deploy' })).not.toBeInTheDocument()
    expect(await screen.findByText('Filtro por ambiente')).toBeInTheDocument()
  })

  it('erro de validação da API aparece no painel', async () => {
    stubApi({ 'GET /api/repositorios': REPOS, 'POST /api/deploys': () => json({ erro: 'Repositório não encontrado neste workspace.' }, 400) })
    montarApp('#/deploys')
    fireEvent.click((await screen.findAllByRole('button', { name: 'Novo deploy' }))[0])
    const painel = await screen.findByRole('dialog', { name: 'Novo deploy' })
    fireEvent.change(await within(painel).findByLabelText('Título'), { target: { value: 'Deploy' } })
    fireEvent.click(within(painel).getByRole('button', { name: 'Criar deploy' }))
    expect(await within(painel).findByRole('alert')).toHaveTextContent('Repositório não encontrado neste workspace.')
  })

  it('sem repositórios: explica e leva às Configurações', async () => {
    stubApi({ 'GET /api/repositorios': [] })
    montarApp('#/deploys')
    fireEvent.click((await screen.findAllByRole('button', { name: 'Novo deploy' }))[0])
    const painel = await screen.findByRole('dialog', { name: 'Novo deploy' })
    expect(await within(painel).findByText('Nenhum repositório ainda')).toBeInTheDocument()
    expect(within(painel).getByRole('link', { name: 'Ir para Configurações' })).toHaveAttribute('href', '#/config/repositorios')
    expect(within(painel).queryByRole('button', { name: 'Criar deploy' })).not.toBeInTheDocument()
  })

  it('erro ao carregar os repositórios: "Tentar de novo" no painel', async () => {
    stubApi({ 'GET /api/repositorios': 500 })
    montarApp('#/deploys')
    fireEvent.click((await screen.findAllByRole('button', { name: 'Novo deploy' }))[0])
    const painel = await screen.findByRole('dialog', { name: 'Novo deploy' })
    expect(await within(painel).findByText('Os repositórios não vieram')).toBeInTheDocument()
  })

  it('também abre pela busca rápida (Ctrl+K) e pelo "+" do celular', async () => {
    stubApi({ 'GET /api/repositorios': REPOS })
    montarApp('/')
    await screen.findByText('Tudo quietinho por aqui')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Busca rápida' })).getByRole('option', { name: 'Novo deploy' }))
    expect(await screen.findByRole('dialog', { name: 'Novo deploy' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Novo deploy' })).getByRole('button', { name: 'Cancelar' }))

    window.history.replaceState(null, '', '/#/deploys')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await screen.findByText('Nenhum deploy nesta semana')
    fireEvent.click(document.querySelector('.fab')!)
    expect(await screen.findByRole('dialog', { name: 'Novo deploy' })).toBeInTheDocument()
  })
})

describe('Detalhe do deploy', () => {
  it('o cartão do calendário abre o detalhe; marcar como concluído e voltar para agendado', async () => {
    let status = 'agendado'
    const f = stubApi({
      'GET /api/repositorios': REPOS,
      'GET /api/deploys': (_: RequestInit | undefined, url: URL) => json(url.searchParams.get('semana') === ESTA_SEMANA ? [{ ...D1, status }] : []),
      'GET /api/deploys/d1': () => json({ ...D1, status }),
      'PATCH /api/deploys/d1/status': (init: RequestInit | undefined) => {
        status = JSON.parse(String(init?.body)).status
        return json({ ...D1, status })
      },
    })
    montarApp('#/deploys')
    const cartao = await screen.findByRole('link', { name: 'Filtro por ambiente' })
    expect(cartao).toHaveAttribute('href', '#/deploys/d1')
    fireEvent.click(cartao)
    expect(window.location.hash).toBe('#/deploys/d1')
    const painel = await screen.findByRole('dialog', { name: 'Filtro por ambiente' })
    expect(await within(painel).findByText('acme/portal')).toBeInTheDocument()
    expect(within(painel).getByText('Agendado')).toBeInTheDocument()

    fireEvent.click(within(painel).getByRole('button', { name: 'Marcar como concluído' }))
    expect(await screen.findByText('Deploy concluído!')).toBeInTheDocument()
    expect(chamadas(f, 'PATCH /api/deploys/d1/status')[0].corpo).toEqual({ status: 'concluido' })
    expect(within(painel).getByText('Concluído')).toBeInTheDocument()
    // O calendário também mostra o novo status (busca de novo sem esqueleto).
    await waitFor(() => expect(within(screen.getByTestId('cartao-deploy')).getByText('Concluído')).toBeInTheDocument())

    fireEvent.click(within(painel).getByRole('button', { name: 'Voltar para agendado' }))
    expect(await screen.findByText('Voltou para agendado')).toBeInTheDocument()
    expect(chamadas(f, 'PATCH /api/deploys/d1/status')[1].corpo).toEqual({ status: 'agendado' })
  })

  it('marcar como falhou', async () => {
    const f = stubApi({ 'GET /api/repositorios': REPOS, 'GET /api/deploys/d1': D1, 'PATCH /api/deploys/d1/status': { ...D1, status: 'falhou' } })
    montarApp('#/deploys/d1')
    const painel = await screen.findByRole('dialog', { name: 'Filtro por ambiente' })
    fireEvent.click(await within(painel).findByRole('button', { name: 'Falhou' }))
    expect(await screen.findByText('Anotado: o deploy falhou')).toBeInTheDocument()
    expect(chamadas(f, 'PATCH /api/deploys/d1/status')[0].corpo).toEqual({ status: 'falhou' })
  })

  it('deploy cancelado não tem ação; erro da API vira aviso', async () => {
    stubApi({ 'GET /api/repositorios': REPOS, 'GET /api/deploys/d1': { ...D1, status: 'cancelado' } })
    montarApp('#/deploys/d1')
    const painel = await screen.findByRole('dialog', { name: 'Filtro por ambiente' })
    expect(await within(painel).findByText(/foi cancelado e não entra nas métricas/)).toBeInTheDocument()
    expect(within(painel).queryByRole('button', { name: 'Marcar como concluído' })).not.toBeInTheDocument()
  })

  it('deploy que não existe (ou de outro workspace)', async () => {
    stubApi({ 'GET /api/deploys/d9': 404 })
    montarApp('#/deploys/d9')
    expect(await screen.findByRole('dialog', { name: 'Esse deploy não está aqui' })).toBeInTheDocument()
  })

  it('erro ao abrir: "Tentar de novo"', async () => {
    stubApi({ 'GET /api/deploys/d1': 500 })
    montarApp('#/deploys/d1')
    expect(await screen.findByText('Não deu pra abrir o deploy')).toBeInTheDocument()
  })
})
