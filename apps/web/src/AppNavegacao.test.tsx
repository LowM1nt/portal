import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clienteFalso, ha, montarApp, stubApi } from './test/app.ts'
import { esquecerTema } from './ui/tema.ts'

const PRS = [1, 2, 3].map((n) => ({
  numero: n,
  titulo: `PR ${n}`,
  autor: 'ana',
  url: `https://github.com/acme/portal/pull/${n}`,
  repositorio: 'acme/portal',
  revisores: ['luis'],
  statusCi: 'sucesso',
  atualizadaEm: ha(n),
}))
const BUGS = ['a_triar', 'a_triar', 'resolvido'].map((status, i) => ({
  id: `b${i}`,
  titulo: `Bug ${i}`,
  relato: '',
  passos: '',
  esperado: '',
  obtido: '',
  severidade: 'media',
  origem: 'manual',
  status,
  criadoEm: ha(1),
  atualizadoEm: ha(1),
}))

const nav = () => screen.getByRole('navigation', { name: 'Navegação principal' })
const link = (nome: string) => within(nav()).getByRole('link', { name: nome })
const celular = (sim: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: sim && q.includes('max-width: 767px'), media: q }))
const arrastar = (alvo: Element, de: [number, number], para: [number, number]) => {
  fireEvent.touchStart(alvo, { touches: [{ clientX: de[0], clientY: de[1] }] })
  fireEvent.touchEnd(alvo, { changedTouches: [{ clientX: para[0], clientY: para[1] }] })
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  esquecerTema()
})

describe('Casca — destinos, contadores e Mais', () => {
  it('dock com Início, Deploys, Revisões, Bugs e Roadmap; abas do celular com Mais no lugar do Roadmap', async () => {
    stubApi()
    montarApp('/')
    await screen.findByText('Tudo quietinho por aqui')
    const nomes = within(nav()).getAllByRole('link').map((a) => a.textContent)
    expect(nomes).toEqual(['Início', 'Deploys', 'Revisões', 'Bugs', 'Roadmap', 'Mais'])
    expect(link('Roadmap').closest('li')).toHaveClass('so-desk')
    expect(link('Mais').closest('li')).toHaveClass('so-cel')
  })

  it('contadores: PRs esperando revisão e bugs a triar, com descrição para leitor de tela', async () => {
    stubApi({ 'GET /api/revisoes': PRS, 'GET /api/bugs': BUGS })
    montarApp('#/deploys')
    await waitFor(() => expect(screen.getByTestId('contador-bugs')).toHaveTextContent('2'))
    expect(screen.getByTestId('contador-revisoes')).toHaveTextContent('3')
    expect(link('Revisões')).toHaveAccessibleDescription('3 PRs esperando revisão')
    expect(link('Bugs')).toHaveAccessibleDescription('2 bugs a triar')
    expect(screen.queryByTestId('contador-inicio')).not.toBeInTheDocument()
  })

  it('sem pendências, nada de bolinha', async () => {
    stubApi()
    montarApp('#/deploys')
    await screen.findByText('Nenhum deploy nesta semana')
    expect(screen.queryByTestId('contador-bugs')).not.toBeInTheDocument()
    expect(screen.queryByTestId('contador-revisoes')).not.toBeInTheDocument()
  })

  it('no Roadmap, a aba "Mais" também fica ativa (é onde ele mora no celular)', async () => {
    stubApi()
    montarApp('#/roadmap')
    await screen.findByText('Roadmap em branco')
    expect(link('Roadmap')).toHaveAttribute('aria-current', 'page')
    expect(link('Mais')).toHaveAttribute('aria-current', 'page')
    expect(link('Início')).not.toHaveAttribute('aria-current')
  })

  it('tela Mais: leva ao Roadmap, troca o tema e sai', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso()
    montarApp('#/mais', cliente)
    const mais = await screen.findByRole('region', { name: 'Mais opções' })
    expect(within(mais).getByRole('link', { name: 'Roadmap' })).toHaveAttribute('href', '#/roadmap')
    fireEvent.click(within(mais).getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(within(mais).getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
  })

  it('"+" flutuante: relatar bug no Início e nos Bugs, novo item no Roadmap, nada nos Deploys', async () => {
    stubApi()
    montarApp('#/bugs')
    await screen.findByText('Nenhum bug esperando triagem')
    const fab = () => document.querySelector('.fab')
    expect(fab()).toHaveAccessibleName('Relatar bug')
    fireEvent.click(fab()!)
    expect(screen.getByRole('dialog', { name: 'Relatar bug' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(link('Roadmap'))
    await screen.findByText('Roadmap em branco')
    expect(fab()).toHaveAccessibleName('Novo item')
    fireEvent.click(link('Deploys'))
    await screen.findByText('Nenhum deploy nesta semana')
    expect(fab()).toBeNull()
  })
})

describe('Casca — busca rápida e arrastar', () => {
  it('Ctrl+K tem "Relatar bug" e os destinos novos', async () => {
    stubApi()
    montarApp('/')
    await screen.findByText('Tudo quietinho por aqui')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const paleta = screen.getByRole('dialog', { name: 'Busca rápida' })
    const nomes = within(paleta).getAllByRole('option').map((o) => o.textContent)
    expect(nomes).toEqual([
      'Relatar bug',
      'Novo item no roadmap',
      'Alternar tema claro/escuro',
      'Sair',
      'Início',
      'Deploys',
      'Revisões',
      'Bugs',
      'Roadmap',
    ])
    fireEvent.click(within(paleta).getByRole('option', { name: 'Relatar bug' }))
    expect(screen.getByRole('dialog', { name: 'Relatar bug' })).toBeInTheDocument()
  })

  it('Ctrl+K → Roadmap navega e marca o destino', async () => {
    stubApi()
    montarApp('/')
    await screen.findByText('Tudo quietinho por aqui')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const campo = within(screen.getByRole('dialog', { name: 'Busca rápida' })).getByRole('combobox')
    fireEvent.change(campo, { target: { value: 'roadm' } })
    expect(within(screen.getByRole('dialog')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Novo item no roadmap', 'Roadmap'])
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByText('Roadmap em branco')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/roadmap')
  })

  it('no celular, arrastar para o lado troca de aba (esquerda avança, direita volta)', async () => {
    celular(true)
    stubApi()
    montarApp('#/revisoes')
    await screen.findByText('Nenhuma PR esperando revisão')
    const main = document.querySelector('main')!
    arrastar(main, [300, 400], [100, 410])
    await waitFor(() => expect(link('Bugs')).toHaveAttribute('aria-current', 'page'))
    arrastar(main, [100, 400], [300, 390])
    await waitFor(() => expect(link('Revisões')).toHaveAttribute('aria-current', 'page'))
  })

  it('rolar na vertical, arrastar curto, arrastar em campo ou no computador não troca de aba', async () => {
    celular(true)
    stubApi()
    montarApp('#/revisoes')
    await screen.findByText('Nenhuma PR esperando revisão')
    const main = document.querySelector('main')!
    arrastar(main, [300, 400], [180, 100]) // mais vertical que horizontal
    arrastar(main, [300, 400], [260, 400]) // curto demais
    arrastar(screen.getByLabelText('Repositório'), [300, 400], [50, 400]) // num campo
    celular(false)
    arrastar(main, [300, 400], [50, 400]) // largura de computador
    expect(link('Revisões')).toHaveAttribute('aria-current', 'page')
  })
})

describe('404', () => {
  it('rota desconhecida mostra "Essa página tirou folga" com caminho de volta', async () => {
    stubApi()
    montarApp('#/qualquer-coisa')
    expect(await screen.findByRole('heading', { name: 'Essa página tirou folga' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/#/inicio')
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
  })

  it('caminho desconhecido (fora do hash) também, mesmo sem login', async () => {
    stubApi()
    montarApp('/nada/aqui', clienteFalso(null).cliente)
    expect(await screen.findByRole('heading', { name: 'Essa página tirou folga' })).toBeInTheDocument()
  })
})
