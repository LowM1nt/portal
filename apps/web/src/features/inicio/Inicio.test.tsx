import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ha, json, montarApp, stubApi } from '../../test/app.ts'
import { rotuloSemana } from '../calendario/semana.ts'

const daqui = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString()

const DEPLOYS = [
  { id: 'd1', repositorioId: 'r', titulo: 'Filtro por ambiente', ambiente: 'producao', status: 'agendado', agendadoPara: daqui(2) },
  { id: 'd2', repositorioId: 'r', titulo: 'Deploy antigo', ambiente: 'producao', status: 'agendado', agendadoPara: ha(5) },
  { id: 'd3', repositorioId: 'r', titulo: 'Cancelado', ambiente: 'producao', status: 'cancelado', agendadoPara: daqui(3) },
]
const PRS = [
  { numero: 418, titulo: 'Exportar calendário', autor: 'ana', url: 'https://github.com/acme/portal/pull/418', repositorio: 'acme/portal', revisores: ['luis'], statusCi: 'sucesso', atualizadaEm: ha(30) },
  { numero: 91, titulo: 'Contraste do tema', autor: 'carla', url: 'javascript:alert(1)', repositorio: 'acme/web', revisores: [], statusCi: 'falhou', atualizadaEm: ha(2) },
]
const BUGS = [
  { id: 'b1', titulo: 'Calendário some', relato: '', passos: '', esperado: '', obtido: '', severidade: 'critica', origem: 'discord', status: 'a_triar', criadoEm: ha(1), atualizadoEm: ha(1) },
  { id: 'b2', titulo: 'Já resolvido', relato: '', passos: '', esperado: '', obtido: '', severidade: 'baixa', origem: 'manual', status: 'resolvido', criadoEm: ha(50), atualizadoEm: new Date().toISOString() },
]

const ESTA_SEMANA = rotuloSemana(new Date())
const soEstaSemana = (_: RequestInit | undefined, url: URL) => json(url.searchParams.get('semana') === ESTA_SEMANA ? DEPLOYS : [])

const numero = (rotulo: string) =>
  screen.getAllByText(rotulo).map((el) => el.closest('.numero')).find(Boolean) as HTMLElement

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Início', () => {
  it('é o destino padrão depois do login (aria-current no Início)', async () => {
    stubApi()
    montarApp('/')
    const inicio = await screen.findByRole('link', { name: 'Início' })
    expect(inicio).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Semana de /)
  })

  it('carregando: esqueleto enquanto os deploys não chegam', async () => {
    stubApi({ 'GET /api/deploys': 'pendente' })
    montarApp('#/inicio')
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(screen.getByText('Carregando…')).toBeInTheDocument())
  })

  it('erro: se um pedaço falha, explica e "Tentar de novo" refaz só o que falhou', async () => {
    const f = stubApi({ 'GET /api/bugs': 500, 'GET /api/deploys': DEPLOYS, 'GET /api/revisoes': PRS })
    montarApp('#/inicio')
    expect(await screen.findByText('Ops, não deu pra montar o Início.')).toBeInTheDocument()
    const antes = f.mock.calls.filter(([u]) => String(u).includes('/api/deploys')).length
    f.mockImplementation(async (url: string | URL) => json(String(url).includes('/api/bugs') ? BUGS : []))
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Deploys na semana')).toBeInTheDocument()
    expect(f.mock.calls.filter(([u]) => String(u).includes('/api/deploys')).length).toBe(antes)
  })

  it('vazio: tudo quietinho, com atalho pro calendário', async () => {
    stubApi()
    montarApp('#/inicio')
    expect(await screen.findByText('Tudo quietinho por aqui')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver o calendário' })).toHaveAttribute('href', '#/deploys')
  })

  it('com dados: números da semana, próximos deploys, fila de revisão e bugs a triar', async () => {
    stubApi({ 'GET /api/deploys': soEstaSemana, 'GET /api/revisoes': PRS, 'GET /api/bugs': BUGS })
    montarApp('#/inicio')
    await screen.findByText('Deploys na semana')
    expect(within(numero('Deploys na semana')).getByText('2')).toBeInTheDocument()
    expect(within(numero('Esperando revisão')).getByText('2')).toBeInTheDocument()
    expect(within(numero('Esperando revisão')).getByText('1 há mais de 24 h')).toHaveClass('atencao')
    expect(within(numero('Bugs a triar')).getByText('1')).toBeInTheDocument()
    expect(within(numero('Bugs a triar')).getByText('1 grave')).toBeInTheDocument()
    expect(within(numero('Resolvidos na semana')).getByText('1')).toBeInTheDocument()

    const deploys = screen.getByRole('region', { name: 'Próximos deploys' })
    expect(within(deploys).getByText('Filtro por ambiente')).toBeInTheDocument()
    expect(within(deploys).getByText(/^(Hoje|Amanhã), /)).toBeInTheDocument()
    expect(within(deploys).queryByText('Deploy antigo')).not.toBeInTheDocument()
    expect(within(deploys).queryByText('Cancelado')).not.toBeInTheDocument()

    const fila = screen.getByRole('region', { name: 'Esperando revisão' })
    expect(within(fila).getByRole('link', { name: 'Exportar calendário' })).toHaveAttribute('href', PRS[0].url)
    // URL que não é https não vira link clicável
    expect(within(fila).getByText('Contraste do tema').closest('a')).not.toHaveAttribute('href')

    const bugs = screen.getByRole('region', { name: 'Bugs a triar' })
    expect(within(bugs).getByRole('link', { name: 'Calendário some' })).toHaveAttribute('href', '#/bugs/b1?f=a_triar')
    expect(within(bugs).queryByText('Já resolvido')).not.toBeInTheDocument()
  })
})
