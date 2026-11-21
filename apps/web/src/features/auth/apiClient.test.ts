import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamarApi } from './apiClient.ts'

function cabecalhosDaChamada(fetchFalso: ReturnType<typeof vi.fn>): Headers {
  const init = fetchFalso.mock.calls[0][1] as RequestInit | undefined
  return new Headers(init?.headers)
}

function stubFetch(status = 200) {
  const fetchFalso = vi.fn(async () => new Response('{}', { status }))
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient', () => {
  it('envia o cabeçalho Authorization com Bearer <token> em toda chamada', async () => {
    const fetchFalso = stubFetch()
    await chamarApi('/api/me', { token: 'tok-1', workspaceId: null, onNaoAutorizado: vi.fn() })
    await chamarApi('/api/workspaces', { token: 'tok-1', workspaceId: 'w1', onNaoAutorizado: vi.fn() })
    expect(fetchFalso).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchFalso.mock.calls as unknown as [string, RequestInit][]) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-1')
    }
  })

  it('envia X-Workspace-Id com o workspace ativo e não envia quando não há', async () => {
    const comWorkspace = stubFetch()
    await chamarApi('/api/workspaces/w1', { token: 't', workspaceId: 'w1', onNaoAutorizado: vi.fn() })
    expect(cabecalhosDaChamada(comWorkspace).get('X-Workspace-Id')).toBe('w1')

    const semWorkspace = stubFetch()
    await chamarApi('/api/me', { token: 't', workspaceId: null, onNaoAutorizado: vi.fn() })
    expect(cabecalhosDaChamada(semWorkspace).has('X-Workspace-Id')).toBe(false)
  })

  it('chama onNaoAutorizado quando a API responde 401', async () => {
    stubFetch(401)
    const onNaoAutorizado = vi.fn()
    await chamarApi('/api/me', { token: 't', workspaceId: null, onNaoAutorizado })
    expect(onNaoAutorizado).toHaveBeenCalledTimes(1)
  })

  it('403 com codigo mfa_necessario chama onMfaNecessario (e não desloga); outro 403 não', async () => {
    const onNaoAutorizado = vi.fn()
    const onMfaNecessario = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ erro: 'x', codigo: 'mfa_necessario' }), { status: 403 })))
    const r = await chamarApi('/api/bugs', { token: 't', workspaceId: 'w1', onNaoAutorizado, onMfaNecessario })
    expect(onMfaNecessario).toHaveBeenCalledTimes(1)
    expect(onNaoAutorizado).not.toHaveBeenCalled()
    // O corpo continua legível para quem chamou.
    expect(((await r.json()) as { codigo: string }).codigo).toBe('mfa_necessario')

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ erro: 'Só o dono do workspace pode mudar isso.' }), { status: 403 })))
    await chamarApi('/api/workspace/convites', { token: 't', workspaceId: 'w1', onNaoAutorizado, onMfaNecessario })
    stubFetch(403)
    await chamarApi('/api/x', { token: 't', workspaceId: null, onNaoAutorizado, onMfaNecessario })
    expect(onMfaNecessario).toHaveBeenCalledTimes(1)
  })

  it('não chama onNaoAutorizado em respostas que não são 401', async () => {
    stubFetch(200)
    const onNaoAutorizado = vi.fn()
    await chamarApi('/api/me', { token: 't', workspaceId: null, onNaoAutorizado })
    expect(onNaoAutorizado).not.toHaveBeenCalled()
  })
})
