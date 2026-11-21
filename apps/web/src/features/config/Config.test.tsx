import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, chamadas, json, montarApp, stubApi } from '../../test/app.ts'

// Valor de mentira, só para o teste (não é um token do GitHub); termina em wxyz como o finalToken das respostas.
const PAT_DE_MENTIRA = 'pat-de-mentira-wxyz'
const DESCONECTADO = { configurado: false, finalToken: null, repositorios: [], ultimaSincronizacao: null, ultimoErro: null }
const CONECTADO = {
  configurado: true,
  finalToken: 'abcd',
  repositorios: ['acme/portal', 'acme/api'],
  ultimaSincronizacao: '2026-11-21T10:20:00Z',
  ultimoErro: 'Token expirado ou sem permissão.',
  configuradoEm: '2026-11-21T09:00:00Z',
}
const comoMembro = { ...ME, workspaces: [{ id: 'w1', nome: 'Acme', papel: 'membro' }] }

const MEMBROS = [
  { usuarioId: 'u1', email: 'ana@exemplo.com', papel: 'dono', voce: true },
  { usuarioId: 'u2', email: 'bia@exemplo.com', papel: 'membro', voce: false },
]
const CONVITES = [{ id: 'c1', email: 'caio@exemplo.com', papel: 'admin', criadoEm: '2026-11-20T10:00:00Z', expiraEm: '2026-11-27T10:00:00Z' }]

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Configurações — Repositórios e integrações', () => {
  it('carregando e erro: esqueleto e depois "Tentar de novo"', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': 500 })
    montarApp('#/config/repositorios')
    expect(await screen.findByText('Ops, não deu pra carregar as integrações.')).toBeInTheDocument()
    f.mockImplementation(async (url: string | URL) => json(String(url).includes('/github') ? DESCONECTADO : ME))
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Conectar o GitHub' })).toBeInTheDocument()
  })

  it('abas: Repositórios e integrações (padrão) e Time e workspace', async () => {
    stubApi({ 'GET /api/integracoes/github': DESCONECTADO })
    montarApp('#/config')
    const abas = await screen.findByRole('navigation', { name: 'Seções das configurações' })
    expect(within(abas).getByRole('link', { name: 'Repositórios e integrações' })).toHaveAttribute('aria-current', 'true')
    expect(within(abas).getByRole('link', { name: 'Time e workspace' })).toHaveAttribute('href', '#/config/time')
    expect(await screen.findAllByText('Em breve')).toHaveLength(2)
    expect(screen.getByText('Discord')).toBeInTheDocument()
    expect(screen.getByText('Slack')).toBeInTheDocument()
  })

  it('dono conecta: token em campo de senha, repositório validado (aceita a URL) e o token nunca volta pra tela', async () => {
    const f = stubApi({
      'GET /api/integracoes/github': DESCONECTADO,
      'PUT /api/integracoes/github': (init: RequestInit | undefined) => {
        const corpo = JSON.parse(String(init?.body))
        return json({ ...DESCONECTADO, configurado: true, finalToken: 'wxyz', repositorios: corpo.repositorios, configuradoEm: '2026-11-21T12:00:00Z' })
      },
    })
    montarApp('#/config/repositorios')
    await screen.findByRole('heading', { name: 'Conectar o GitHub' })
    const token = screen.getByLabelText('Token do GitHub')
    expect(token).toHaveAttribute('type', 'password')

    const novo = screen.getByLabelText('Adicionar repositório')
    fireEvent.change(novo, { target: { value: 'repo-sem-dono' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use o formato dono/repo')
    fireEvent.change(novo, { target: { value: 'https://github.com/acme/portal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(within(screen.getByRole('list', { name: 'Repositórios acompanhados' })).getByText('acme/portal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Conectar GitHub' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Cola o token do GitHub')
    expect(chamadas(f, 'PUT /api/integracoes/github')).toHaveLength(0)

    fireEvent.change(token, { target: { value: PAT_DE_MENTIRA } })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar GitHub' }))
    expect(await screen.findByText('GitHub conectado!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/github')[0].corpo).toEqual({ token: PAT_DE_MENTIRA, repositorios: ['acme/portal'] })
    expect(screen.queryByLabelText('Token do GitHub')).not.toBeInTheDocument()
    expect(screen.getByText('••••wxyz')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(PAT_DE_MENTIRA)
  })

  it('configurado: mostra data, final do token, sincronização e erro; troca só repositórios sem mandar token', async () => {
    const f = stubApi({
      'GET /api/integracoes/github': CONECTADO,
      'PUT /api/integracoes/github': (init: RequestInit | undefined) => json({ ...CONECTADO, repositorios: JSON.parse(String(init?.body)).repositorios }),
    })
    montarApp('#/config/repositorios')
    expect(await screen.findByText(/Token configurado em 21\/11\/2026/)).toBeInTheDocument()
    expect(screen.getByText('••••abcd')).toBeInTheDocument()
    expect(screen.getByText(/Última sincronização:/)).toBeInTheDocument()
    expect(screen.getByText('Token expirado ou sem permissão.')).toBeInTheDocument()
    expect(screen.getByText('Com erro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar repositórios' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Tirar acme/api da lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar repositórios' }))
    expect(await screen.findByText('Repositórios salvos!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/github')[0].corpo).toEqual({ repositorios: ['acme/portal'] })
  })

  it('trocar token: modal com campo de senha manda o token novo e a lista atual', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': CONECTADO, 'PUT /api/integracoes/github': { ...CONECTADO, finalToken: 'wxyz' } })
    montarApp('#/config/repositorios')
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar token' }))
    const modal = screen.getByRole('dialog', { name: 'Trocar o token do GitHub' })
    fireEvent.change(within(modal).getByLabelText('Token do GitHub'), { target: { value: PAT_DE_MENTIRA } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar token' }))
    expect(await screen.findByText('Token trocado!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/github')[0].corpo).toEqual({ token: PAT_DE_MENTIRA, repositorios: ['acme/portal', 'acme/api'] })
    expect(screen.getByText('••••wxyz')).toBeInTheDocument()
  })

  it('remover pede confirmação e depois fica desconectado', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': CONECTADO, 'DELETE /api/integracoes/github': () => new Response(null, { status: 204 }) })
    montarApp('#/config/repositorios')
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }))
    const modal = screen.getByRole('dialog', { name: 'Remover o GitHub?' })
    expect(chamadas(f, 'DELETE /api/integracoes/github')).toHaveLength(0)
    fireEvent.click(within(modal).getByRole('button', { name: 'Remover' }))
    expect(await screen.findByText('Desconectado')).toBeInTheDocument()
    expect(chamadas(f, 'DELETE /api/integracoes/github')).toHaveLength(1)
  })

  it('membro vê somente leitura, com explicação', async () => {
    stubApi({ 'GET /api/me': comoMembro, 'GET /api/integracoes/github': CONECTADO })
    montarApp('#/config/repositorios')
    expect(await screen.findByText(/Só o dono do workspace muda as integrações/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar token' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Adicionar repositório')).not.toBeInTheDocument()
    expect(screen.getByText('acme/portal')).toBeInTheDocument()
  })
})

describe('Configurações — Time e workspace', () => {
  it('dono: membros com papel, convites pendentes e zona de perigo informativa', async () => {
    stubApi({ 'GET /api/workspace/membros': MEMBROS, 'GET /api/workspace/convites': CONVITES })
    montarApp('#/config/time')
    const lista = await screen.findByRole('list', { name: 'Membros do workspace' })
    expect(within(lista).getByText('(você)')).toBeInTheDocument()
    expect(within(lista).getByLabelText('Papel de bia@exemplo.com')).toHaveValue('membro')
    // Ninguém muda o próprio papel por aqui.
    expect(within(lista).queryByLabelText('Papel de ana@exemplo.com')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Convites pendentes' })).getByText('caio@exemplo.com')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zona de perigo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excluir workspace/ })).not.toBeInTheDocument()
  })

  it('mudar papel: sucesso atualiza; último dono mostra a mensagem da API', async () => {
    const f = stubApi({
      'GET /api/workspace/membros': MEMBROS,
      'PATCH /api/workspace/membros/u2': () => json({ erro: 'O workspace precisa de pelo menos um dono. Promova outra pessoa a dono antes.' }, 409),
    })
    montarApp('#/config/time')
    const papel = await screen.findByLabelText('Papel de bia@exemplo.com')
    fireEvent.change(papel, { target: { value: 'admin' } })
    expect(await screen.findByText('Não deu pra trocar o papel')).toBeInTheDocument()
    expect(screen.getByText(/precisa de pelo menos um dono/)).toBeInTheDocument()
    expect(chamadas(f, 'PATCH /api/workspace/membros/u2')[0].corpo).toEqual({ papel: 'admin' })
    expect(papel).toHaveValue('membro')
  })

  it('remover membro pede confirmação', async () => {
    const f = stubApi({ 'GET /api/workspace/membros': MEMBROS, 'DELETE /api/workspace/membros/u2': () => new Response(null, { status: 204 }) })
    montarApp('#/config/time')
    fireEvent.click(await screen.findByRole('button', { name: 'Remover bia@exemplo.com' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remover bia@exemplo.com?' })).getByRole('button', { name: 'Remover' }))
    expect(await screen.findByText('Pessoa removida')).toBeInTheDocument()
    expect(chamadas(f, 'DELETE /api/workspace/membros/u2')).toHaveLength(1)
    expect(screen.queryByText('bia@exemplo.com')).not.toBeInTheDocument()
  })

  it('convidar: mostra o link UMA vez, com copiar e aviso; depois o convite fica na lista de pendentes', async () => {
    const LINK = 'http://localhost:5173/convite#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
    const copiar = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copiar } })
    const f = stubApi({
      'GET /api/workspace/membros': MEMBROS,
      'POST /api/workspace/convites': () => json({ id: 'c9', email: 'dani@exemplo.com', papel: 'admin', expiraEm: '2026-11-28T10:00:00Z', link: LINK }, 201),
    })
    montarApp('#/config/time')
    fireEvent.click(await screen.findByRole('button', { name: 'Convidar' }))
    const modal = screen.getByRole('dialog', { name: 'Convidar pro time' })
    fireEvent.change(within(modal).getByLabelText('E-mail'), { target: { value: 'nao-e-email' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Criar convite' }))
    expect(within(modal).getByRole('alert')).toHaveTextContent('Informe um e-mail válido')
    fireEvent.change(within(modal).getByLabelText('E-mail'), { target: { value: 'dani@exemplo.com' } })
    fireEvent.change(within(modal).getByLabelText('Papel'), { target: { value: 'admin' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Criar convite' }))

    const criado = await screen.findByRole('dialog', { name: 'Convite criado!' })
    expect(within(criado).getByLabelText('Link do convite')).toHaveValue(LINK)
    expect(within(criado).getByText(/Copie agora:/)).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/workspace/convites')[0].corpo).toEqual({ email: 'dani@exemplo.com', papel: 'admin' })
    fireEvent.click(within(criado).getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(copiar).toHaveBeenCalledWith(LINK))
    expect(within(criado).getByRole('button', { name: 'Copiado!' })).toBeInTheDocument()

    fireEvent.click(within(criado).getByRole('button', { name: 'Pronto' }))
    expect(screen.queryByDisplayValue(LINK)).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('abcdefghijklmnop')
    expect(within(screen.getByRole('list', { name: 'Convites pendentes' })).getByText('dani@exemplo.com')).toBeInTheDocument()
  })

  it('revogar convite pede confirmação e tira da lista', async () => {
    const f = stubApi({ 'GET /api/workspace/membros': MEMBROS, 'GET /api/workspace/convites': CONVITES, 'DELETE /api/workspace/convites/c1': () => new Response(null, { status: 204 }) })
    montarApp('#/config/time')
    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Revogar o convite?' })).getByRole('button', { name: 'Revogar' }))
    expect(await screen.findByText('Convite revogado')).toBeInTheDocument()
    expect(chamadas(f, 'DELETE /api/workspace/convites/c1')).toHaveLength(1)
    expect(screen.getByText('Nenhum convite esperando resposta.')).toBeInTheDocument()
  })

  it('membro: sem convidar, sem mudar papéis e sem pedir convites (que são só do dono)', async () => {
    const f = stubApi({ 'GET /api/me': comoMembro, 'GET /api/workspace/membros': MEMBROS })
    montarApp('#/config/time')
    await screen.findByRole('list', { name: 'Membros do workspace' })
    expect(screen.getByText(/Só quem é dono convida/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidar' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Papel de/)).not.toBeInTheDocument()
    expect(chamadas(f, 'GET /api/workspace/convites')).toHaveLength(0)
  })
})
