// Ajudantes de teste: App inteiro com Supabase de mentira e /api respondida por rota.
import { createElement } from 'react'
import { render } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'
import App from '../App.tsx'

export const sessao = { access_token: 'tok', user: { id: 'u1', email: 'ana@exemplo.com' } } as unknown as Session

export const ME = { usuarioId: 'u1', email: 'ana@exemplo.com', workspaces: [{ id: 'w1', nome: 'Acme', papel: 'dono' }] }

type Ouvinte = (evento: string, s: Session | null) => void

/** Cliente do Supabase falso; `emitir` simula eventos (SIGNED_IN, PASSWORD_RECOVERY…). */
export function clienteFalso(s: Session | null = sessao) {
  let ouvinte: Ouvinte | undefined
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: s } }),
    onAuthStateChange: vi.fn((cb: Ouvinte) => {
      ouvinte = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    // "Sair das outras sessões" (scope: 'others') não desloga este aparelho.
    signOut: vi.fn(async (opcoes?: { scope?: string }) => {
      if (opcoes?.scope !== 'others') ouvinte?.('SIGNED_OUT', null)
      return { error: null }
    }),
    signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    // Verificação em duas etapas: por padrão, sem fator cadastrado (aal1 → aal1, nada a pedir).
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })),
      listFactors: vi.fn(async () => ({ data: { all: [], totp: [] }, error: null })),
      enroll: vi.fn(async () => ({
        data: { id: 'f1', type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>', secret: 'SEGREDO123', uri: 'otpauth://x' } },
        error: null,
      })),
      challengeAndVerify: vi.fn(async () => ({ data: {}, error: null })),
      unenroll: vi.fn(async () => ({ data: {}, error: null })),
    },
  }
  return { auth, cliente: { auth } as unknown as SupabaseClient, emitir: (evento: string, nova: Session | null) => ouvinte?.(evento, nova) }
}

export const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })

/** Resposta de uma rota: corpo JSON, status HTTP, 'pendente' (nunca responde) ou função. */
export type Resposta = unknown | number | 'pendente' | ((init: RequestInit | undefined, url: URL) => Response | Promise<Response>)

/** Integrações que respondem objeto (não lista): sem resposta no teste, vêm desconectadas. */
const PADRAO: Record<string, unknown> = {
  'GET /api/integracoes/discord': { configurado: false, finalToken: null, canalId: null, ultimaLeitura: null, ultimoErro: null },
  'GET /api/integracoes/ia': { configurado: false, provedor: null },
}

/**
 * Troca o fetch por um roteador: a chave é "MÉTODO /caminho" (ex.: "GET /api/bugs").
 * /api/me responde o workspace Acme; Discord e IA vêm desconectados; outra rota sem resposta devolve lista vazia.
 */
export function stubApi(rotas: Record<string, Resposta> = {}) {
  const f = vi.fn(async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(url), 'http://teste')
    const chave = `${init?.method ?? 'GET'} ${u.pathname}`
    if (chave === 'GET /api/me' && !('GET /api/me' in rotas)) return json(ME)
    const r = rotas[chave]
    if (r === undefined) return json(chave in PADRAO ? PADRAO[chave] : [])
    if (r === 'pendente') return new Promise<Response>(() => {})
    if (typeof r === 'number') return new Response('', { status: r })
    if (typeof r === 'function') return (r as (init: RequestInit | undefined, url: URL) => Response | Promise<Response>)(init, u)
    return json(r)
  })
  vi.stubGlobal('fetch', f)
  return f
}

/** Chamadas feitas a uma rota ("PATCH /api/bugs/b1/status"), com o corpo já lido. */
export function chamadas(f: ReturnType<typeof stubApi>, chave: string) {
  return f.mock.calls
    .filter(([url, init]) => `${init?.method ?? 'GET'} ${new URL(String(url), 'http://teste').pathname}` === chave)
    .map(([url, init]) => ({ url: String(url), init, corpo: init?.body ? JSON.parse(String(init.body)) : undefined }))
}

/** Monta o App num endereço (`#/bugs`, `/nada`…). */
export function montarApp(endereco: string, cliente: SupabaseClient = clienteFalso().cliente) {
  window.history.replaceState(null, '', endereco.startsWith('/') ? endereco : `/${endereco}`)
  return render(createElement(App, { cliente }))
}

const H = 3_600_000
/** Data ISO de `horas` atrás. */
export const ha = (horas: number) => new Date(Date.now() - horas * H).toISOString()
