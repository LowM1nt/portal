import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../auth/AuthProvider.tsx'
import { Calendario } from './Calendario.tsx'

// Hoje (fixo): sexta 20/11/2026 = semana 2026-W47 (16/11 a 22/11).
const sessao = { access_token: 'tok-cal', user: { email: 'a@exemplo.com' } } as Session

function clienteFalso() {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: sessao } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  }
  return { auth } as unknown as SupabaseClient
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status })
}

const me = () => resposta({ usuarioId: 'u1', email: 'a@exemplo.com', workspaces: [{ id: 'w1', nome: 'Meu workspace', papel: 'dono' }] })

function deploy(id: string, titulo: string, dia: number, hora: number, minuto = 0) {
  return {
    id,
    repositorioId: 'r1',
    titulo,
    ambiente: 'producao',
    status: 'agendado',
    agendadoPara: new Date(2026, 10, dia, hora, minuto).toISOString(),
  }
}

type Chamada = [string, RequestInit | undefined]

/** fetch falso: /api/me responde o workspace; /api/deploys usa o tratador do teste. */
function stubFetch(tratador: (url: string) => Promise<Response> | Response) {
  const f = vi.fn(async (url: string) => (String(url).includes('/api/me') ? me() : tratador(String(url))))
  vi.stubGlobal('fetch', f)
  return f
}

const chamadasDeploys = (f: ReturnType<typeof stubFetch>) =>
  (f.mock.calls as unknown as Chamada[]).filter((c) => String(c[0]).includes('/api/deploys'))

function Porta() {
  const { estado } = useAuth()
  return estado === 'pronto' ? <Calendario /> : null
}

function montar() {
  return render(
    <AuthProvider cliente={clienteFalso()}>
      <Porta />
    </AuthProvider>,
  )
}

function definirLargura(estreita: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: estreita,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 20, 10, 0))
  definirLargura(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Calendario', () => {
  it('carregando: enquanto o fetch não resolve mostra o indicador e nenhum cartão', async () => {
    stubFetch(() => new Promise<Response>(() => {}))
    montar()
    expect(await screen.findByText('Carregando…')).toBeInTheDocument()
    expect(screen.queryAllByTestId('cartao-deploy')).toHaveLength(0)
  })

  it('com dados: 3 deploys viram 3 cartões, cada um no dia certo, com título e horário', async () => {
    stubFetch(() =>
      resposta([
        deploy('d1', 'Release API', 17, 9, 30),
        deploy('d2', 'Hotfix login', 19, 14, 5),
        deploy('d3', 'Migração', 22, 23, 0),
      ]),
    )
    const { container } = montar()
    expect(await screen.findAllByTestId('cartao-deploy')).toHaveLength(3)
    const noDia = (dia: string) => container.querySelector<HTMLElement>(`[data-dia="${dia}"]`)!
    const esperado: [string, string, string][] = [
      ['2026-11-17', 'Release API', '09:30'],
      ['2026-11-19', 'Hotfix login', '14:05'],
      ['2026-11-22', 'Migração', '23:00'],
    ]
    for (const [dia, titulo, hora] of esperado) {
      const cartoes = within(noDia(dia)).getAllByTestId('cartao-deploy')
      expect(cartoes).toHaveLength(1)
      expect(within(cartoes[0]).getByText(titulo)).toBeInTheDocument()
      expect(within(cartoes[0]).getByText(hora)).toBeInTheDocument()
    }
    expect(screen.queryByText('Nenhum deploy nesta semana')).not.toBeInTheDocument()
  })

  it('vazio: resposta [] mostra "Nenhum deploy nesta semana" e nenhum cartão', async () => {
    stubFetch(() => resposta([]))
    montar()
    expect(await screen.findByText('Nenhum deploy nesta semana')).toBeInTheDocument()
    expect(screen.queryAllByTestId('cartao-deploy')).toHaveLength(0)
  })

  it('erro: status 500 mostra a mensagem e "Tentar de novo"; clicar volta a carregar e refaz a chamada', async () => {
    let n = 0
    const f = stubFetch(() => {
      n++
      if (n === 1) return new Response('', { status: 500 })
      if (n === 2) return new Promise<Response>(() => {}) // fica carregando
      return resposta([])
    })
    montar()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryAllByTestId('cartao-deploy')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Carregando…')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(chamadasDeploys(f)).toHaveLength(2))
  })

  it('erro: fetch que falha por rede mostra a mensagem e "Tentar de novo"', async () => {
    stubFetch(() => Promise.reject(new TypeError('rede')))
    montar()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('navegação: "Próxima semana" e "Semana anterior" chamam /api/deploys com a semana vizinha', async () => {
    const f = stubFetch(() => resposta([]))
    montar()
    await screen.findByText('Nenhum deploy nesta semana')
    expect(chamadasDeploys(f)[0][0]).toContain('semana=2026-W47')

    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }))
    await waitFor(() => expect(chamadasDeploys(f).some((c) => String(c[0]).includes('semana=2026-W48'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))
    await waitFor(() => expect(chamadasDeploys(f).some((c) => String(c[0]).includes('semana=2026-W46'))).toBe(true))
  })

  it('cabeçalhos: a chamada usa o apiClient e envia Authorization e X-Workspace-Id do workspace ativo', async () => {
    const f = stubFetch(() => resposta([]))
    montar()
    await screen.findByText('Nenhum deploy nesta semana')
    const chamada = chamadasDeploys(f)[0]
    const h = new Headers(chamada[1]?.headers)
    expect(h.get('Authorization')).toBe('Bearer tok-cal')
    expect(h.get('X-Workspace-Id')).toBe('w1')
  })

  it('celular: em viewport estreita a mesma lista de deploys aparece como lista, com os mesmos cartões', async () => {
    definirLargura(true)
    stubFetch(() => resposta([deploy('d1', 'Release API', 17, 9, 30), deploy('d2', 'Hotfix', 18, 10)]))
    montar()
    const lista = await screen.findByRole('list', { name: 'Deploys da semana' })
    expect(within(lista).getAllByRole('listitem').length).toBeGreaterThanOrEqual(7)
    const cartoes = within(lista).getAllByTestId('cartao-deploy')
    expect(cartoes).toHaveLength(2)
    expect(within(lista).getByText('Release API')).toBeInTheDocument()
    expect(within(lista).getByText('Hotfix')).toBeInTheDocument()
  })

  it('celular: o CSS tem media query e usa só tokens (sem cor, tamanho ou vão soltos)', () => {
    const css = readFileSync(new URL('./calendario.css', import.meta.url), 'utf8')
    expect(css).toMatch(/@media/)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(|\bhsla?\(/)
    const decls = css.match(/\b(gap|padding|margin|font-size|color|background)[a-z-]*\s*:\s*[^;]+;/g) ?? []
    for (const d of decls) {
      const valor = d.split(':')[1]
      expect(valor, d).toMatch(/var\(--|^\s*(0|auto|inherit|transparent|currentColor)\b/)
      expect(valor, d).not.toMatch(/\b\d+(\.\d+)?(px|rem|em)\b/)
    }
  })
})
