import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'

export type Linha = { id: number; ts: string; tipo: string; dados: Record<string, unknown> }
type Resposta = { data: unknown; error: { message: string } | null }
export type Chamada = { metodo: string; args: unknown[] }

// Cliente falso: grava cada chamada encadeada (select/in/gte/limit…) e termina numa resposta.
export function clienteFalso(opcoes: { linhas?: Linha[]; erro?: boolean; pendente?: boolean }) {
  const chamadas: Chamada[] = []
  const from = vi.fn((tabela: string) => {
    chamadas.push({ metodo: 'from', args: [tabela] })
    const resposta = (): Promise<Resposta> => {
      if (opcoes.pendente) return new Promise(() => {})
      if (opcoes.erro) return Promise.resolve({ data: null, error: { message: 'falhou' } })
      return Promise.resolve({ data: opcoes.linhas ?? [], error: null })
    }
    const construtor: unknown = new Proxy(() => {}, {
      get(_alvo, prop) {
        if (prop === 'then') return (ok: (v: Resposta) => unknown, ko?: (e: unknown) => unknown) => resposta().then(ok, ko)
        return (...args: unknown[]) => {
          chamadas.push({ metodo: String(prop), args })
          return construtor
        }
      },
    })
    return construtor
  })
  return { cliente: { from } as unknown as SupabaseClient, from, chamadas }
}
