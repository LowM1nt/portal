import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, chamadas, json, montarApp, stubApi } from '../../test/app.ts'
import { guardarConvite } from '../convite/convite.ts'
import { escolhaFeita, guardarEscolha } from './primeirosPassos.ts'

// Valor de mentira, só para o teste (não é um token do GitHub).
const PAT_DE_MENTIRA = 'pat-de-mentira-wxyz'
const DESCONECTADO = { configurado: false, finalToken: null, repositorios: [], ultimaSincronizacao: null, ultimoErro: null }
const CONECTADO = { ...DESCONECTADO, configurado: true, finalToken: 'wxyz', configuradoEm: '2026-11-21T12:00:00Z' }
const PESSOAL = { ...ME, workspaces: [{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }] }
const LINK = 'https://releasy.pages.dev/convite#token=link-de-mentira'

/** PUT do GitHub que devolve a configuração com o que foi mandado (sem nunca devolver o token). */
const putGithub = (init: RequestInit | undefined) => {
  const corpo = JSON.parse(String(init?.body))
  return json({ ...CONECTADO, repositorios: corpo.repositorios })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome })

describe('Primeiros passos — quando aparece', () => {
  it('só o workspace pessoal e sem GitHub: o Início leva pro passo 1', async () => {
    stubApi({ 'GET /api/me': PESSOAL, 'GET /api/integracoes/github': DESCONECTADO })
    montarApp('#/inicio')
    expect(await titulo('Dá um nome pro seu workspace')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/primeiros-passos?passo=1')
    const passos = screen.getByRole('list', { name: 'Passo 1 de 4' })
    expect(within(passos).getAllByRole('listitem')).toHaveLength(4)
    expect(within(passos).getByText('Workspace').closest('li')).toHaveAttribute('aria-current', 'step')
    // Fora da casca: sem dock nem abas.
    expect(screen.queryByRole('navigation', { name: /principal|navegação/i })).not.toBeInTheDocument()
  })

  it('GitHub já configurado: fica no Início', async () => {
    const f = stubApi({ 'GET /api/me': PESSOAL, 'GET /api/integracoes/github': CONECTADO })
    montarApp('#/inicio')
    await waitFor(() => expect(chamadas(f, 'GET /api/integracoes/github')).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(window.location.hash).toBe('#/inicio')
    expect(screen.queryByRole('heading', { name: 'Dá um nome pro seu workspace' })).not.toBeInTheDocument()
  })

  it('mais de um workspace, convite pendente ou escolha já feita: nem confere o GitHub', async () => {
    const casos: Array<[string, () => void, unknown]> = [
      ['dois workspaces', () => undefined, { ...ME, workspaces: [...PESSOAL.workspaces, { id: 'w2', nome: 'Acme', papel: 'membro' }] }],
      ['escolha guardada', () => guardarEscolha('u1', 'pulado'), PESSOAL],
      ['convite pendente', () => guardarConvite('A'.repeat(43)), PESSOAL],
      ['só membro', () => undefined, { ...ME, workspaces: [{ id: 'w1', nome: 'Time', papel: 'membro' }] }],
    ]
    for (const [, preparar, me] of casos) {
      preparar()
      const f = stubApi({ 'GET /api/me': me, 'GET /api/integracoes/github': DESCONECTADO, 'POST /api/convites/aceitar': 'pendente' })
      const { unmount } = montarApp('#/inicio')
      await screen.findByRole('heading', { level: 1, name: /Semana de/ })
      await new Promise((r) => setTimeout(r, 20))
      expect(window.location.hash).toBe('#/inicio')
      expect(chamadas(f, 'GET /api/integracoes/github')).toHaveLength(0)
      unmount()
      vi.unstubAllGlobals()
      window.localStorage.clear()
      window.sessionStorage.clear()
    }
  })

  it('localStorage bloqueado não quebra: o fluxo aparece e dá pra sair', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    stubApi({ 'GET /api/me': PESSOAL, 'GET /api/integracoes/github': DESCONECTADO })
    montarApp('#/inicio')
    await titulo('Dá um nome pro seu workspace')
    fireEvent.click(screen.getByRole('button', { name: 'Fazer depois' }))
    expect(await screen.findByText('Beleza, fica pra depois')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/inicio')
  })

  it('Configurações tem o atalho pra retomar', async () => {
    stubApi({ 'GET /api/integracoes/github': CONECTADO })
    montarApp('#/config')
    expect(await screen.findByRole('link', { name: 'Primeiros passos' })).toHaveAttribute('href', '#/primeiros-passos?passo=1')
  })
})

describe('Primeiros passos — passo 1 (workspace)', () => {
  it('nome padrão: campo vazio, valida, cria pelo POST e seleciona o novo', async () => {
    const f = stubApi({
      'GET /api/me': PESSOAL,
      'GET /api/integracoes/github': DESCONECTADO,
      'POST /api/workspaces': () => json({ id: 'w2', nome: 'Acme', papel: 'dono' }, 201),
    })
    montarApp('#/primeiros-passos?passo=1')
    await titulo('Dá um nome pro seu workspace')
    const campo = screen.getByLabelText('Nome do workspace')
    expect(campo).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Dá um nome pro workspace')
    expect(chamadas(f, 'POST /api/workspaces')).toHaveLength(0)

    fireEvent.change(campo, { target: { value: '  Acme  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Workspace criado!')).toBeInTheDocument()
    expect(await titulo('Conecta o GitHub')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/workspaces')[0].corpo).toEqual({ nome: 'Acme' })
    expect(window.location.hash).toBe('#/primeiros-passos?passo=2')
    // O GitHub do passo 2 é lido já no workspace novo.
    const leituras = chamadas(f, 'GET /api/integracoes/github')
    expect(new Headers(leituras[leituras.length - 1].init?.headers).get('X-Workspace-Id')).toBe('w2')
  })

  it('mesmo nome do workspace atual: segue sem criar outro', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': DESCONECTADO })
    montarApp('#/primeiros-passos?passo=1')
    await titulo('Dá um nome pro seu workspace')
    expect(screen.getByLabelText('Nome do workspace')).toHaveValue('Acme')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await titulo('Conecta o GitHub')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/workspaces')).toHaveLength(0)
  })

  it('erro da API ao criar: mostra a mensagem dela e fica no passo', async () => {
    stubApi({
      'GET /api/me': PESSOAL,
      'GET /api/integracoes/github': DESCONECTADO,
      'POST /api/workspaces': () => json({ erro: 'Você chegou ao limite de 10 workspaces.' }, 400),
    })
    montarApp('#/primeiros-passos?passo=1')
    await titulo('Dá um nome pro seu workspace')
    fireEvent.change(screen.getByLabelText('Nome do workspace'), { target: { value: 'Acme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Você chegou ao limite de 10 workspaces.')
    expect(window.location.hash).toBe('#/primeiros-passos?passo=1')
  })
})

describe('Primeiros passos — passo 2 (GitHub)', () => {
  it('explica como gerar o token, campo de senha, salva pelo PUT e o token some da tela', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': DESCONECTADO, 'PUT /api/integracoes/github': putGithub })
    montarApp('#/primeiros-passos?passo=2')
    await titulo('Conecta o GitHub')
    const link = screen.getByRole('link', { name: 'github.com/settings/tokens' })
    expect(link).toHaveAttribute('href', 'https://github.com/settings/tokens')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const token = screen.getByLabelText('Token do GitHub')
    expect(token).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Conectar GitHub' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Cola o token do GitHub')
    expect(chamadas(f, 'PUT /api/integracoes/github')).toHaveLength(0)

    fireEvent.change(token, { target: { value: PAT_DE_MENTIRA } })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar GitHub' }))
    expect(await screen.findByText('GitHub conectado!')).toBeInTheDocument()
    expect(await titulo('Quais repositórios entram?')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/github')[0].corpo).toEqual({ token: PAT_DE_MENTIRA, repositorios: [] })
    expect(document.body.innerHTML).not.toContain(PAT_DE_MENTIRA)
    expect(window.location.href).not.toContain(PAT_DE_MENTIRA)

    // Voltando ao passo 2: mostra conectado (final do token), sem campo.
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await titulo('GitHub conectado')).toBeInTheDocument()
    expect(screen.getByText('••••wxyz')).toBeInTheDocument()
    expect(screen.queryByLabelText('Token do GitHub')).not.toBeInTheDocument()
  })

  it('erro da API ao salvar: mostra a mensagem e não avança', async () => {
    stubApi({ 'GET /api/integracoes/github': DESCONECTADO, 'PUT /api/integracoes/github': () => json({ erro: 'O token do GitHub é longo demais.' }, 400) })
    montarApp('#/primeiros-passos?passo=2')
    await titulo('Conecta o GitHub')
    fireEvent.change(screen.getByLabelText('Token do GitHub'), { target: { value: PAT_DE_MENTIRA } })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar GitHub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O token do GitHub é longo demais.')
    expect(window.location.hash).toBe('#/primeiros-passos?passo=2')
  })

  it('pular vai pro passo 3, que pede o GitHub antes dos repositórios', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': DESCONECTADO })
    montarApp('#/primeiros-passos?passo=2')
    await titulo('Conecta o GitHub')
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(await titulo('Quais repositórios entram?')).toBeInTheDocument()
    expect(screen.getByText(/conecta o GitHub primeiro/)).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/github')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(await titulo('Chama o time')).toBeInTheDocument()
  })

  it('erro ao ler o GitHub: estado de erro com "Tentar de novo"', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': 500 })
    montarApp('#/primeiros-passos?passo=2')
    expect(await screen.findByText('Ops, não deu pra carregar o GitHub do workspace.')).toBeInTheDocument()
    f.mockImplementation(async (url: string | URL) => json(String(url).includes('/github') ? DESCONECTADO : ME))
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await titulo('Conecta o GitHub')).toBeInTheDocument()
  })

  it('carregando: esqueleto enquanto o GitHub não vem', async () => {
    stubApi({ 'GET /api/integracoes/github': 'pendente' })
    montarApp('#/primeiros-passos?passo=2')
    await waitFor(() => expect(document.querySelector('.onb-carregando[aria-busy="true"]')).not.toBeNull())
  })
})

describe('Primeiros passos — passo 3 (repositórios)', () => {
  it('adiciona (valida e aceita URL), remove e salva sem mandar token', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': CONECTADO, 'PUT /api/integracoes/github': putGithub })
    montarApp('#/primeiros-passos?passo=3')
    await titulo('Quais repositórios entram?')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument()
    const novo = screen.getByLabelText('Adicionar repositório')
    fireEvent.change(novo, { target: { value: 'sem-dono' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use o formato dono/repo')
    fireEvent.change(novo, { target: { value: 'https://github.com/acme/portal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(novo, { target: { value: 'acme/api' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tirar acme/api da lista' }))
    expect(screen.getByText('1 de 50')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByText('Repositórios salvos!')).toBeInTheDocument()
    expect(await titulo('Chama o time')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/github')[0].corpo).toEqual({ repositorios: ['acme/portal'] })
  })

  it('pular descarta a lista e não salva', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': CONECTADO })
    montarApp('#/primeiros-passos?passo=3')
    await titulo('Quais repositórios entram?')
    fireEvent.change(screen.getByLabelText('Adicionar repositório'), { target: { value: 'acme/portal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(await titulo('Chama o time')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/github')).toHaveLength(0)
  })

  it('erro da API ao salvar: mostra a mensagem e fica', async () => {
    stubApi({ 'GET /api/integracoes/github': CONECTADO, 'PUT /api/integracoes/github': () => json({ erro: 'Cada repositório deve estar no formato dono/repo.' }, 400) })
    montarApp('#/primeiros-passos?passo=3')
    await titulo('Quais repositórios entram?')
    fireEvent.change(screen.getByLabelText('Adicionar repositório'), { target: { value: 'acme/portal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cada repositório deve estar no formato dono/repo.')
    expect(window.location.hash).toBe('#/primeiros-passos?passo=3')
  })
})

describe('Primeiros passos — passo 4 (time) e saída', () => {
  it('convida pelo mesmo modal (link uma vez, com copiar), conclui com "Tudo pronto!" e não reaparece', async () => {
    const copiar = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copiar } })
    const f = stubApi({
      'GET /api/me': PESSOAL,
      'GET /api/integracoes/github': DESCONECTADO,
      'POST /api/workspace/convites': () =>
        json({ id: 'c9', email: 'bia@exemplo.com', papel: 'membro', criadoEm: '2026-11-21T10:00:00Z', expiraEm: '2026-11-28T10:00:00Z', link: LINK }, 201),
    })
    const { unmount } = montarApp('#/primeiros-passos?passo=4')
    await titulo('Chama o time')
    expect(screen.getByRole('button', { name: 'Pular e concluir' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Convidar alguém' }))
    const modal = screen.getByRole('dialog', { name: 'Convidar pro time' })
    fireEvent.change(within(modal).getByLabelText('E-mail'), { target: { value: 'bia@exemplo.com' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Criar convite' }))
    const criado = await screen.findByRole('dialog', { name: 'Convite criado!' })
    expect(within(criado).getByLabelText('Link do convite')).toHaveValue(LINK)
    fireEvent.click(within(criado).getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(copiar).toHaveBeenCalledWith(LINK))
    fireEvent.click(within(criado).getByRole('button', { name: 'Pronto' }))
    expect(within(screen.getByRole('list', { name: 'Convites criados' })).getByText('bia@exemplo.com')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(LINK)
    expect(chamadas(f, 'POST /api/workspace/convites')[0].corpo).toEqual({ email: 'bia@exemplo.com', papel: 'membro' })

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Tudo pronto!')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/inicio')
    expect(escolhaFeita('u1')).toBe('concluido')

    // Outra visita ao Início: não volta pro onboarding (nem consulta o GitHub pra isso).
    unmount()
    const g = stubApi({ 'GET /api/me': PESSOAL, 'GET /api/integracoes/github': DESCONECTADO })
    montarApp('#/inicio')
    await screen.findByRole('heading', { level: 1, name: /Semana de/ })
    await new Promise((r) => setTimeout(r, 20))
    expect(window.location.hash).toBe('#/inicio')
    expect(chamadas(g, 'GET /api/integracoes/github')).toHaveLength(0)
  })

  it('"Fazer depois" guarda a escolha, avisa e vai pro Início sem reaparecer', async () => {
    stubApi({ 'GET /api/me': PESSOAL, 'GET /api/integracoes/github': DESCONECTADO })
    montarApp('#/inicio')
    await titulo('Dá um nome pro seu workspace')
    fireEvent.click(screen.getByRole('button', { name: 'Fazer depois' }))
    expect(await screen.findByText('Beleza, fica pra depois')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/inicio')
    expect(escolhaFeita('u1')).toBe('pulado')
    await screen.findByRole('heading', { level: 1, name: /Semana de/ })
    expect(screen.queryByRole('heading', { name: 'Dá um nome pro seu workspace' })).not.toBeInTheDocument()
  })

  it('erro ao carregar os dados da conta: "Tentar de novo" na própria tela', async () => {
    stubApi({ 'GET /api/me': 500 })
    montarApp('#/primeiros-passos?passo=1')
    expect(await screen.findByText('Ops, não deu pra carregar seus dados.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('quem não é dono não passa dos passos 2 a 4: volta pro workspace', async () => {
    stubApi({ 'GET /api/me': { ...ME, workspaces: [{ id: 'w1', nome: 'Time', papel: 'membro' }] } })
    montarApp('#/primeiros-passos?passo=3')
    expect(await titulo('Esse passo é com quem é dono')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar pro workspace' }))
    expect(await titulo('Dá um nome pro seu workspace')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome do workspace')).toHaveValue('')
  })
})
