import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, montarApp, stubApi } from '../../test/app.ts'

const DOIS = { ...ME, workspaces: [{ id: 'w1', nome: 'Acme', papel: 'dono' }, { id: 'w2', nome: 'Time Beta', papel: 'membro' }] }
const CHAVE = 'releasy-workspace:u1'

/** Workspace mandado na última chamada à API (fora o /api/me, que vai sem). */
function ultimoWorkspace(f: ReturnType<typeof stubApi>) {
  const chamada = f.mock.calls.filter(([url]) => !String(url).includes('/api/me')).at(-1)
  return new Headers(chamada?.[1]?.headers).get('X-Workspace-Id')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Workspace lembrado', () => {
  it('a escolha fica guardada por usuário e volta ao recarregar', async () => {
    const f = stubApi({ 'GET /api/me': DOIS })
    const { unmount } = montarApp('#/bugs')
    fireEvent.change(await screen.findByLabelText('Workspace'), { target: { value: 'w2' } })
    await waitFor(() => expect(screen.getByLabelText('Workspace')).toHaveValue('w2'))
    expect(window.localStorage.getItem(CHAVE)).toBe('w2')
    unmount()

    // "Recarregar": monta de novo do zero e já começa no Time Beta.
    montarApp('#/bugs')
    await waitFor(() => expect(screen.getByLabelText('Workspace')).toHaveValue('w2'))
    await waitFor(() => expect(ultimoWorkspace(f)).toBe('w2'))
  })

  it('id lembrado que não está mais na lista de /api/me é descartado: vale o primeiro', async () => {
    window.localStorage.setItem(CHAVE, 'w-que-saiu')
    const f = stubApi({ 'GET /api/me': DOIS })
    montarApp('#/bugs')
    await waitFor(() => expect(screen.getByLabelText('Workspace')).toHaveValue('w1'))
    await waitFor(() => expect(window.localStorage.getItem(CHAVE)).toBeNull())
    await waitFor(() => expect(ultimoWorkspace(f)).toBe('w1'))
  })

  it('o lembrado de outra pessoa não vale pra quem entrou', async () => {
    window.localStorage.setItem('releasy-workspace:outra-pessoa', 'w2')
    stubApi({ 'GET /api/me': DOIS })
    montarApp('#/bugs')
    await waitFor(() => expect(screen.getByLabelText('Workspace')).toHaveValue('w1'))
  })

  it('armazenamento bloqueado não quebra: começa no primeiro e trocar continua funcionando', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    stubApi({ 'GET /api/me': DOIS })
    montarApp('#/bugs')
    const seletor = await screen.findByLabelText('Workspace')
    await waitFor(() => expect(seletor).toHaveValue('w1'))
    fireEvent.change(seletor, { target: { value: 'w2' } })
    await waitFor(() => expect(seletor).toHaveValue('w2'))
  })
})
