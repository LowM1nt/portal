import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, chamadas, json, montarApp, stubApi } from '../../test/app.ts'

// Valores de mentira, só para o teste (não são credenciais de verdade).
const TOKEN_BOT_DE_MENTIRA = 'bot-token-de-mentira-9z8y'
const CHAVE_IA_DE_MENTIRA = 'chave-ia-de-mentira-q1w2'
const CANAL = '123456789012345678'
const GITHUB_OFF = { configurado: false, finalToken: null, repositorios: [], ultimaSincronizacao: null, ultimoErro: null }
const GITHUB_ON = { configurado: true, finalToken: 'abcd', repositorios: ['acme/portal'], ultimaSincronizacao: null, ultimoErro: null }
const DISCORD_OFF = { configurado: false, finalToken: null, canalId: null, ultimaLeitura: null, ultimoErro: null }
const DISCORD_ON = {
  configurado: true,
  finalToken: '9z8y',
  canalId: CANAL,
  ultimaLeitura: '2026-11-21T10:20:00Z',
  ultimoErro: 'Token do bot inválido ou sem acesso ao canal.',
  configuradoEm: '2026-11-21T09:00:00Z',
}
const IA_OFF = { configurado: false, provedor: null }
const IA_ON = { configurado: true, provedor: 'gemini' }
const comoMembro = { ...ME, workspaces: [{ id: 'w1', nome: 'Acme', papel: 'membro' }] }

const cartaoDe = (nome: string) => screen.getByText(nome, { selector: '.integ-cartao > b' }).closest('.integ-cartao') as HTMLElement

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Configurações — Discord', () => {
  it('dono conecta: passo a passo, token em campo de senha, canal validado e o token nunca volta pra tela', async () => {
    const f = stubApi({
      'GET /api/integracoes/github': GITHUB_OFF,
      'GET /api/integracoes/discord': DISCORD_OFF,
      'PUT /api/integracoes/discord': () => json({ ...DISCORD_OFF, configurado: true, finalToken: '9z8y', canalId: CANAL, configuradoEm: '2026-11-21T12:00:00Z' }),
    })
    montarApp('#/config/repositorios')
    const bloco = await screen.findByRole('region', { name: 'Conectar o Discord' })
    const link = within(bloco).getByRole('link', { name: 'discord.com/developers' })
    expect(link).toHaveAttribute('href', 'https://discord.com/developers/applications')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(bloco).getByText(/Message Content Intent/)).toBeInTheDocument()
    expect(within(bloco).getByText(/Copiar ID do canal/)).toBeInTheDocument()
    expect(within(cartaoDe('Discord')).getByText('Desconectado')).toBeInTheDocument()

    const token = within(bloco).getByLabelText('Token do bot')
    expect(token).toHaveAttribute('type', 'password')
    fireEvent.click(within(bloco).getByRole('button', { name: 'Conectar Discord' }))
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Cola o token do bot')
    fireEvent.change(token, { target: { value: TOKEN_BOT_DE_MENTIRA } })
    fireEvent.change(within(bloco).getByLabelText('ID do canal'), { target: { value: '#bugs' } })
    fireEvent.click(within(bloco).getByRole('button', { name: 'Conectar Discord' }))
    expect(within(bloco).getByRole('alert')).toHaveTextContent('O ID do canal tem de 17 a 20 números')
    expect(chamadas(f, 'PUT /api/integracoes/discord')).toHaveLength(0)

    fireEvent.change(within(bloco).getByLabelText('ID do canal'), { target: { value: CANAL } })
    fireEvent.click(within(bloco).getByRole('button', { name: 'Conectar Discord' }))
    expect(await screen.findByText('Discord conectado!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/discord')[0].corpo).toEqual({ token: TOKEN_BOT_DE_MENTIRA, canalId: CANAL })
    expect(screen.queryByRole('region', { name: 'Conectar o Discord' })).not.toBeInTheDocument()
    expect(within(cartaoDe('Discord')).getByText('••••9z8y')).toBeInTheDocument()
    expect(within(cartaoDe('Discord')).getByText('Conectado')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(TOKEN_BOT_DE_MENTIRA)
  })

  it('configurado: mostra final do token, canal, última leitura e erro; trocar só o canal não manda token', async () => {
    const f = stubApi({
      'GET /api/integracoes/github': GITHUB_ON,
      'GET /api/integracoes/discord': DISCORD_ON,
      'PUT /api/integracoes/discord': (init: RequestInit | undefined) =>
        json({ ...DISCORD_ON, canalId: JSON.parse(String(init?.body)).canalId, ultimoErro: null }),
    })
    montarApp('#/config/repositorios')
    await waitFor(() => expect(within(cartaoDe('Discord')).getByText('••••9z8y')).toBeInTheDocument())
    const c = cartaoDe('Discord')
    expect(within(c).getByText(CANAL)).toBeInTheDocument()
    expect(within(c).getByText(/Última leitura:/)).toBeInTheDocument()
    expect(within(c).getByText('Token do bot inválido ou sem acesso ao canal.')).toBeInTheDocument()
    expect(within(c).getByText('Com erro')).toBeInTheDocument()

    fireEvent.click(within(c).getByRole('button', { name: 'Trocar' }))
    const modal = screen.getByRole('dialog', { name: 'Trocar o Discord' })
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar' }))
    expect(within(modal).getByRole('alert')).toHaveTextContent('Cola um token novo ou troca o canal')
    fireEvent.change(within(modal).getByLabelText('ID do canal'), { target: { value: '987654321098765432' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Discord atualizado!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/discord')[0].corpo).toEqual({ canalId: '987654321098765432' })
    expect(within(cartaoDe('Discord')).getByText('Conectado')).toBeInTheDocument()
  })

  it('trocar o token manda o token novo; remover pede confirmação', async () => {
    const f = stubApi({
      'GET /api/integracoes/github': GITHUB_ON,
      'GET /api/integracoes/discord': DISCORD_ON,
      'PUT /api/integracoes/discord': { ...DISCORD_ON, finalToken: 'abcd', ultimoErro: null },
      'DELETE /api/integracoes/discord': () => new Response(null, { status: 204 }),
    })
    montarApp('#/config/repositorios')
    await waitFor(() => expect(within(cartaoDe('Discord')).getByRole('button', { name: 'Trocar' })).toBeInTheDocument())
    fireEvent.click(within(cartaoDe('Discord')).getByRole('button', { name: 'Trocar' }))
    const modal = screen.getByRole('dialog', { name: 'Trocar o Discord' })
    fireEvent.change(within(modal).getByLabelText('Token novo do bot (opcional)'), { target: { value: TOKEN_BOT_DE_MENTIRA } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Discord atualizado!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/discord')[0].corpo).toEqual({ token: TOKEN_BOT_DE_MENTIRA, canalId: CANAL })
    expect(document.body.innerHTML).not.toContain(TOKEN_BOT_DE_MENTIRA)

    fireEvent.click(within(cartaoDe('Discord')).getByRole('button', { name: 'Remover' }))
    const confirmar = screen.getByRole('dialog', { name: 'Remover o Discord?' })
    expect(chamadas(f, 'DELETE /api/integracoes/discord')).toHaveLength(0)
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Remover' }))
    expect(await screen.findByText('Discord removido')).toBeInTheDocument()
    expect(chamadas(f, 'DELETE /api/integracoes/discord')).toHaveLength(1)
    expect(within(cartaoDe('Discord')).getByText('Desconectado')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Conectar o Discord' })).toBeInTheDocument()
  })

  it('erro ao ler o Discord fica no cartão; o resto da tela continua', async () => {
    const f = stubApi({ 'GET /api/integracoes/github': GITHUB_ON, 'GET /api/integracoes/discord': 500 })
    montarApp('#/config/repositorios')
    await waitFor(() => expect(within(cartaoDe('Discord')).getByText('Sem resposta')).toBeInTheDocument())
    expect(screen.getByText('••••abcd')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conectar o Discord' })).not.toBeInTheDocument()
    f.mockImplementation(async (url: string | URL) => {
      const p = new URL(String(url), 'http://teste').pathname
      if (p === '/api/integracoes/discord') return json(DISCORD_ON)
      if (p === '/api/integracoes/github') return json(GITHUB_ON)
      if (p === '/api/integracoes/ia') return json(IA_OFF)
      return json(p === '/api/me' ? ME : [])
    })
    fireEvent.click(within(cartaoDe('Discord')).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(within(cartaoDe('Discord')).getByText('••••9z8y')).toBeInTheDocument())
  })
})

describe('Configurações — IA', () => {
  it('dono liga: passo a passo da chave grátis, avisos, chave em campo de senha que nunca volta', async () => {
    const f = stubApi({
      'GET /api/integracoes/github': GITHUB_ON,
      'GET /api/integracoes/ia': IA_OFF,
      'PUT /api/integracoes/ia': IA_ON,
    })
    montarApp('#/config/repositorios')
    const bloco = await screen.findByRole('region', { name: 'Ligar a triagem com IA' })
    const link = within(bloco).getByRole('link', { name: 'aistudio.google.com' })
    expect(link).toHaveAttribute('href', 'https://aistudio.google.com/apikey')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(bloco).getByText(/Get API key/)).toBeInTheDocument()
    expect(within(bloco).getByText(/limite de pedidos por minuto e por dia/)).toBeInTheDocument()
    expect(within(bloco).getByText(/vão pro Google/)).toBeInTheDocument()
    expect(within(cartaoDe('Triagem com IA')).getByText('Desligada')).toBeInTheDocument()
    expect(within(bloco).getByLabelText('Provedor')).toHaveValue('gemini')

    const chave = within(bloco).getByLabelText('Chave da IA')
    expect(chave).toHaveAttribute('type', 'password')
    fireEvent.click(within(bloco).getByRole('button', { name: 'Ligar a IA' }))
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Cola a chave da IA')
    expect(chamadas(f, 'PUT /api/integracoes/ia')).toHaveLength(0)
    fireEvent.change(chave, { target: { value: CHAVE_IA_DE_MENTIRA } })
    fireEvent.click(within(bloco).getByRole('button', { name: 'Ligar a IA' }))
    expect(await screen.findByText('IA ligada!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/ia')[0].corpo).toEqual({ provedor: 'gemini', chave: CHAVE_IA_DE_MENTIRA })
    expect(within(cartaoDe('Triagem com IA')).getByText('Ligada')).toBeInTheDocument()
    expect(within(cartaoDe('Triagem com IA')).getByText(/Google Gemini/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ligar a triagem com IA' })).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(CHAVE_IA_DE_MENTIRA)
  })

  it('trocar a chave e remover (com confirmação)', async () => {
    const f = stubApi({
      'GET /api/integracoes/github': GITHUB_ON,
      'GET /api/integracoes/ia': IA_ON,
      'PUT /api/integracoes/ia': IA_ON,
      'DELETE /api/integracoes/ia': () => new Response(null, { status: 204 }),
    })
    montarApp('#/config/repositorios')
    await waitFor(() => expect(within(cartaoDe('Triagem com IA')).getByRole('button', { name: 'Trocar chave' })).toBeInTheDocument())
    fireEvent.click(within(cartaoDe('Triagem com IA')).getByRole('button', { name: 'Trocar chave' }))
    const modal = screen.getByRole('dialog', { name: 'Trocar a chave da IA' })
    fireEvent.change(within(modal).getByLabelText('Chave da IA'), { target: { value: CHAVE_IA_DE_MENTIRA } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar chave' }))
    expect(await screen.findByText('Chave trocada!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/ia')[0].corpo).toEqual({ provedor: 'gemini', chave: CHAVE_IA_DE_MENTIRA })
    expect(document.body.innerHTML).not.toContain(CHAVE_IA_DE_MENTIRA)

    fireEvent.click(within(cartaoDe('Triagem com IA')).getByRole('button', { name: 'Remover' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remover a chave da IA?' })).getByRole('button', { name: 'Remover' }))
    expect(await screen.findByText('Chave da IA removida')).toBeInTheDocument()
    expect(chamadas(f, 'DELETE /api/integracoes/ia')).toHaveLength(1)
    expect(within(cartaoDe('Triagem com IA')).getByText('Desligada')).toBeInTheDocument()
  })
})

describe('Configurações — Discord e IA para membro', () => {
  it('membro só vê o estado: sem trocar, remover nem formulários', async () => {
    const f = stubApi({
      'GET /api/me': comoMembro,
      'GET /api/integracoes/github': GITHUB_ON,
      'GET /api/integracoes/discord': DISCORD_ON,
      'GET /api/integracoes/ia': IA_ON,
    })
    montarApp('#/config/repositorios')
    await waitFor(() => expect(within(cartaoDe('Discord')).getByText('••••9z8y')).toBeInTheDocument())
    expect(within(cartaoDe('Triagem com IA')).getByText('Ligada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar chave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/integracoes/discord')).toHaveLength(0)
  })

  it('membro com tudo desligado: explica que quem é dono conecta', async () => {
    stubApi({ 'GET /api/me': comoMembro, 'GET /api/integracoes/github': GITHUB_ON })
    montarApp('#/config/repositorios')
    expect(await screen.findByText(/Quem é dono conecta/)).toBeInTheDocument()
    expect(screen.getByText(/Quem é dono liga/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conectar o Discord' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ligar a triagem com IA' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Token do bot')).not.toBeInTheDocument()
  })
})
