import { fireEvent, render, screen } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { DemoPage } from './DemoPage.tsx'

// Hoje (fixo): sexta 20/11/2026 = semana 2026-W47 (16/11 a 22/11).
function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status })
}

function deploy(id: string, titulo: string, dia: number, hora: number) {
  return {
    id,
    repositorioId: 'r1',
    titulo,
    ambiente: 'producao',
    status: 'agendado',
    agendadoPara: new Date(Date.UTC(2026, 10, dia, hora, 0)).toISOString(),
  }
}

function stubFetch(tratador: (url: string) => Promise<Response> | Response) {
  const f = vi.fn(async (url: string) => tratador(String(url)))
  vi.stubGlobal('fetch', f)
  return f
}

const urls = (f: ReturnType<typeof stubFetch>) => f.mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 20, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.pushState({}, '', '/')
})

describe('DemoPage', () => {
  it('mostra os deploys de /api/demo/deploys da semana, sem token nem X-Workspace-Id', async () => {
    const f = stubFetch(() => resposta([deploy('d1', 'Release fictícia', 17, 9), deploy('d2', 'Hotfix fictício', 19, 14)]))
    render(<DemoPage />)

    expect(await screen.findAllByTestId('cartao-deploy')).toHaveLength(2)
    expect(screen.getByText('Release fictícia')).toBeInTheDocument()
    expect(urls(f).some((u) => u.includes('/api/demo/deploys?semana=2026-W47'))).toBe(true)
    for (const [, init] of f.mock.calls as unknown as [string, RequestInit | undefined][]) {
      const h = new Headers(init?.headers)
      expect(h.has('Authorization')).toBe(false)
      expect(h.has('X-Workspace-Id')).toBe(false)
    }
  })

  it('não mostra controles de criar, editar ou cancelar e mostra o aviso de dados fictícios', async () => {
    stubFetch(() => resposta([deploy('d1', 'Release fictícia', 17, 9)]))
    render(<DemoPage />)

    await screen.findAllByTestId('cartao-deploy')
    expect(screen.getByText('Demonstração com dados fictícios')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /criar|novo|agendar|adicionar|editar|cancelar|excluir|remover/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /criar|novo|agendar|editar|cancelar/i })).not.toBeInTheDocument()
    // Só a navegação de semanas continua disponível.
    expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument()
  })

  it('carregando: enquanto o fetch não resolve mostra o indicador e nenhum cartão', async () => {
    stubFetch(() => new Promise<Response>(() => {}))
    render(<DemoPage />)

    expect(await screen.findByText('Carregando…')).toBeInTheDocument()
    expect(screen.queryAllByTestId('cartao-deploy')).toHaveLength(0)
  })

  it('vazio: resposta [] mostra "Nenhum deploy nesta semana"', async () => {
    stubFetch(() => resposta([]))
    render(<DemoPage />)

    expect(await screen.findByText('Nenhum deploy nesta semana')).toBeInTheDocument()
    expect(screen.getByText('Demonstração com dados fictícios')).toBeInTheDocument()
  })

  it('erro: status 500 mostra a mensagem e "Tentar de novo"; clicar refaz a chamada', async () => {
    let n = 0
    const f = stubFetch(() => {
      n++
      return n === 1 ? new Response('', { status: 500 }) : resposta([deploy('d1', 'Release fictícia', 17, 9)])
    })
    render(<DemoPage />)

    expect(await screen.findByText('Não foi possível carregar os deploys.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findAllByTestId('cartao-deploy')).toHaveLength(1)
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('App — rota /demo', () => {
  it('renderiza o calendário sem sessão e sem chamar /api/me nem o Supabase', async () => {
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    }
    const cliente = { auth } as unknown as SupabaseClient
    const f = stubFetch(() => resposta([deploy('d1', 'Release fictícia', 17, 9)]))
    window.history.pushState({}, '', '/demo')

    render(<App cliente={cliente} />)

    expect(await screen.findAllByTestId('cartao-deploy')).toHaveLength(1)
    expect(screen.queryByRole('form', { name: 'Entrar no portal' })).not.toBeInTheDocument()
    expect(urls(f).some((u) => u.includes('/api/me'))).toBe(false)
    expect(urls(f).every((u) => u.includes('/api/demo/deploys'))).toBe(true)
    expect(auth.getSession).not.toHaveBeenCalled()
  })

  it('funciona mesmo sem configuração do Supabase (cliente nulo)', async () => {
    stubFetch(() => resposta([]))
    window.history.pushState({}, '', '/demo')

    render(<App cliente={null} />)

    expect(await screen.findByText('Nenhum deploy nesta semana')).toBeInTheDocument()
    expect(screen.getByText('Demonstração com dados fictícios')).toBeInTheDocument()
  })
})
