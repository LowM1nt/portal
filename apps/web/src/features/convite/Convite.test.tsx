import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, chamadas, clienteFalso, json, montarApp, sessao, stubApi } from '../../test/app.ts'
import { convitePendente } from './convite.ts'

// Convite de mentira no formato que a API gera (43 caracteres Base64Url), montado para ficar óbvio que não é segredo.
const CONVITE_FALSO = 'convite-de-teste-'.padEnd(43, 'x')
const NOVO_WS = { id: 'w2', nome: 'Time da Bia', papel: 'membro' }

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  window.sessionStorage.clear()
})

const urls = (f: ReturnType<typeof stubApi>) => f.mock.calls.map(([u]) => String(u))

describe('Convite (/convite#token=…)', () => {
  it('logado: aceita, entra no workspace (toast) e limpa o fragmento sem mandar o token na URL', async () => {
    let aceito = false
    const f = stubApi({
      'GET /api/me': () => json(aceito ? { ...ME, workspaces: [...ME.workspaces, NOVO_WS] } : ME),
      'POST /api/convites/aceitar': () => {
        aceito = true
        return json({ workspaceId: 'w2', nome: 'Time da Bia', papel: 'membro' })
      },
    })
    montarApp(`/convite#token=${CONVITE_FALSO}`)
    expect(window.location.pathname).toBe('/')
    expect(window.location.href).not.toContain(CONVITE_FALSO)

    expect(await screen.findByText('Bem-vindo ao Time da Bia!')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/convites/aceitar')).toHaveLength(1)
    expect(chamadas(f, 'POST /api/convites/aceitar')[0].corpo).toEqual({ token: CONVITE_FALSO })
    expect(urls(f).some((u) => u.includes(CONVITE_FALSO))).toBe(false)
    expect(convitePendente()).toBeNull()
    // Recarrega o /api/me e já entra no workspace novo.
    await waitFor(() => expect(document.querySelector('.ws-nome')).toHaveTextContent('Time da Bia'))
  })

  it('sem login: guarda o convite só nesta aba, pede pra entrar e aceita depois do login', async () => {
    const f = stubApi({ 'POST /api/convites/aceitar': { workspaceId: 'w1', nome: 'Acme', papel: 'membro' } })
    const { cliente, emitir } = clienteFalso(null)
    montarApp(`/convite#token=${CONVITE_FALSO}`, cliente)
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByText(/Você recebeu um convite!/)).toBeInTheDocument()
    expect(window.location.href).not.toContain(CONVITE_FALSO)
    expect(window.sessionStorage.getItem('releasy-convite')).toBe(CONVITE_FALSO)
    expect(chamadas(f, 'POST /api/convites/aceitar')).toHaveLength(0)

    emitir('SIGNED_IN', sessao)
    expect(await screen.findByText('Bem-vindo ao Acme!')).toBeInTheDocument()
    expect(chamadas(f, 'POST /api/convites/aceitar')).toHaveLength(1)
  })

  it('convite inválido, expirado ou de outro e-mail: mostra a mensagem neutra da API', async () => {
    stubApi({ 'POST /api/convites/aceitar': () => json({ erro: 'Convite inválido ou expirado. Peça um novo convite ao dono do workspace.' }, 400) })
    montarApp(`/convite#token=${CONVITE_FALSO}`)
    expect(await screen.findByText('Não deu pra aceitar o convite')).toBeInTheDocument()
    expect(screen.getByText(/Peça um novo convite/)).toBeInTheDocument()
    expect(convitePendente()).toBeNull()
  })

  it('quem já é membro recebe um aviso amigável (409)', async () => {
    stubApi({ 'POST /api/convites/aceitar': () => json({ erro: 'Você já faz parte deste workspace.' }, 409) })
    montarApp(`/convite#token=${CONVITE_FALSO}`)
    expect(await screen.findByText('Você já faz parte desse workspace')).toBeInTheDocument()
  })

  it('token com formato estranho é ignorado (nem guardado nem enviado)', async () => {
    const f = stubApi()
    montarApp('/convite#token=<script>')
    await screen.findByText('Tudo quietinho por aqui')
    expect(window.location.pathname).toBe('/')
    expect(chamadas(f, 'POST /api/convites/aceitar')).toHaveLength(0)
    fireEvent.click(screen.getByRole('link', { name: 'Início' }))
    expect(convitePendente()).toBeNull()
  })
})
