import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../auth/AuthProvider.tsx'
import { FilaRevisao } from './FilaRevisao.tsx'

const sessao = { access_token: 'tok-fila', user: { email: 'a@exemplo.com' } } as Session

function clienteFalso() {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: sessao } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  }
  return { auth } as unknown as SupabaseClient
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })
const me = () => json({ usuarioId: 'u1', email: 'a@exemplo.com', workspaces: [{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }] })

const agora = new Date(2026, 10, 20, 12, 0).getTime()
const atras = (ms: number) => new Date(agora - ms).toISOString()
const H = 3_600_000

function pr(numero: number, extra: Record<string, unknown> = {}) {
  return {
    numero,
    titulo: `Título ${numero}`,
    autor: `autor${numero}`,
    url: `https://github.com/org/repo/pull/${numero}`,
    repositorio: 'org/api',
    revisores: ['ana'],
    statusCi: 'sucesso',
    atualizadaEm: atras(3 * H),
    ...extra,
  }
}

const tres = () => [
  pr(1, { repositorio: 'org/api', revisores: ['ana'], statusCi: 'sucesso', atualizadaEm: atras(3 * H) }),
  pr(2, { repositorio: 'org/web', revisores: ['bia', 'caio'], statusCi: 'falhou', atualizadaEm: atras(48 * H) }),
  pr(3, { repositorio: 'org/web', revisores: ['ana', 'bia'], statusCi: 'rodando', atualizadaEm: atras(5 * 60_000) }),
]

type Chamada = [string, RequestInit | undefined]

function stubFetch(tratador: (url: string) => Promise<Response> | Response) {
  const f = vi.fn(async (url: string) => (String(url).includes('/api/me') ? me() : tratador(String(url))))
  vi.stubGlobal('fetch', f)
  return f
}
const chamadasFila = (f: ReturnType<typeof stubFetch>) =>
  (f.mock.calls as unknown as Chamada[]).filter((c) => String(c[0]).includes('/api/revisoes'))

function Porta() {
  const { estado } = useAuth()
  return estado === 'pronto' ? <FilaRevisao /> : null
}
function montar() {
  return render(
    <AuthProvider cliente={clienteFalso()}>
      <Porta />
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(agora)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const linhas = () => screen.queryAllByRole('listitem').filter((li) => li.querySelector('a[href]'))

describe('FilaRevisao', () => {
  it('lista uma linha por PR com link, repositório, autor, revisores, selo de CI e há quanto tempo', async () => {
    const f = stubFetch(() => json(tres()))
    montar()
    await screen.findByRole('link', { name: 'Título 1' })
    expect(linhas()).toHaveLength(3)
    const link = screen.getByRole('link', { name: 'Título 2' })
    expect(link).toHaveAttribute('href', 'https://github.com/org/repo/pull/2')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    const linha = linhas()[1]
    expect(within(linha).getByText(/org\/web/)).toBeInTheDocument()
    expect(within(linha).getByText(/autor2/)).toBeInTheDocument()
    expect(within(linha).getByText(/bia/)).toBeInTheDocument()
    expect(within(linha).getByText(/caio/)).toBeInTheDocument()
    expect(linha.querySelector('.selo')).toHaveTextContent(/falhou/i)
    expect(within(linha).getByText('há 2 dias')).toBeInTheDocument()
    expect(within(linhas()[0]).getByText('há 3 h')).toBeInTheDocument()
    expect(within(linhas()[2]).getByText('há 5 min')).toBeInTheDocument()
    // a chamada leva o workspace ativo
    const c = chamadasFila(f)[0]
    expect(new Headers(c[1]?.headers).get('X-Workspace-Id')).toBe('w1')
    expect(new Headers(c[1]?.headers).get('Authorization')).toBe('Bearer tok-fila')
  })

  it('cada statusCi vira um .selo com o rótulo em português', async () => {
    const lista = [
      pr(1, { statusCi: 'sucesso' }),
      pr(2, { statusCi: 'falhou' }),
      pr(3, { statusCi: 'rodando' }),
      pr(4, { statusCi: 'sem CI' }),
    ]
    stubFetch(() => json(lista))
    montar()
    await screen.findByRole('link', { name: 'Título 1' })
    const rotulos = ['Sucesso', 'Falhou', 'Rodando', 'Sem CI']
    linhas().forEach((li, i) => {
      const selo = li.querySelector('.selo')
      expect(selo).not.toBeNull()
      expect(selo!.textContent).toMatch(new RegExp(`^${rotulos[i]}$`, 'i'))
    })
  })

  it('filtros por repositório e por revisor combinam, "Todos" restaura e as opções vêm da lista completa', async () => {
    stubFetch(() => json(tres()))
    montar()
    await screen.findByRole('link', { name: 'Título 1' })
    const repo = screen.getByLabelText('Repositório')
    const revisor = screen.getByLabelText('Revisor')
    const titulos = () => linhas().map((li) => li.querySelector('a')!.textContent)
    const opcoes = (s: HTMLElement) => within(s).getAllByRole('option').map((o) => o.textContent)

    expect(opcoes(repo)).toEqual(expect.arrayContaining(['Todos', 'org/api', 'org/web']))
    expect(opcoes(revisor)).toEqual(expect.arrayContaining(['Todos', 'ana', 'bia', 'caio']))

    fireEvent.change(repo, { target: { value: 'org/web' } })
    expect(titulos()).toEqual(['Título 2', 'Título 3'])
    // opções continuam as mesmas depois de filtrar
    expect(opcoes(repo)).toEqual(expect.arrayContaining(['org/api', 'org/web']))
    expect(opcoes(revisor)).toEqual(expect.arrayContaining(['ana', 'bia', 'caio']))

    fireEvent.change(revisor, { target: { value: 'ana' } })
    expect(titulos()).toEqual(['Título 3'])

    fireEvent.change(repo, { target: { value: '' } })
    fireEvent.change(revisor, { target: { value: 'bia' } })
    expect(titulos()).toEqual(['Título 2', 'Título 3'])

    fireEvent.change(revisor, { target: { value: '' } })
    expect(titulos()).toHaveLength(3)
    expect(within(repo).getByRole('option', { name: 'Todos' })).toBeInTheDocument()
  })

  it('carregando: mostra o indicador e nenhuma lista', async () => {
    stubFetch(() => new Promise<Response>(() => {}))
    montar()
    expect(await screen.findByText('Carregando…')).toBeInTheDocument()
    expect(linhas()).toHaveLength(0)
  })

  it('vazio: lista vazia mostra "Nenhuma PR esperando revisão"', async () => {
    stubFetch(() => json([]))
    montar()
    expect(await screen.findByText('Nenhuma PR esperando revisão')).toBeInTheDocument()
  })

  it('erro: mostra a mensagem e "Tentar de novo" volta a carregar, refaz a chamada e mostra a lista', async () => {
    let n = 0
    const f = stubFetch(() => {
      n += 1
      return n === 1 ? new Response('', { status: 500 }) : json(tres())
    })
    montar()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(linhas()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('link', { name: 'Título 1' })).toBeInTheDocument()
    await waitFor(() => expect(chamadasFila(f)).toHaveLength(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('erro de rede também cai no estado de erro', async () => {
    stubFetch(() => Promise.reject(new TypeError('rede')))
    montar()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('filtro sem resultado mostra o estado vazio sem quebrar', async () => {
    stubFetch(() => json(tres()))
    montar()
    await screen.findByRole('link', { name: 'Título 1' })
    fireEvent.change(screen.getByLabelText('Repositório'), { target: { value: 'org/api' } })
    fireEvent.change(screen.getByLabelText('Revisor'), { target: { value: 'caio' } })
    expect(await screen.findByText('Nenhuma PR esperando revisão')).toBeInTheDocument()
    expect(linhas()).toHaveLength(0)
    // os filtros seguem disponíveis para desfazer
    fireEvent.change(screen.getByLabelText('Revisor'), { target: { value: '' } })
    expect(linhas()).toHaveLength(1)
  })
})
