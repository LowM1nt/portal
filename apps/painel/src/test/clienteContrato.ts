import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'
import { CONTRATO } from '../contrato.ts'

export type LinhaEvento = { id: number; ts: string; tipo: string; origem?: string; dados: Record<string, unknown> }
type Resposta = { data: unknown; error: { message: string } | null }
export type Opcoes = {
  linhas?: Record<string, Record<string, unknown>[]>
  erro?: boolean
  pendente?: boolean
  erroInsert?: boolean
}

function exigirTabela(tabela: string) {
  if (!(tabela in CONTRATO)) throw new Error(`Tabela fora do contrato: ${tabela}`)
}

function exigirColuna(tabela: string, coluna: string) {
  const base = coluna.split(/->>?|\./)[0].trim()
  if (!(CONTRATO as Record<string, readonly string[]>)[tabela].includes(base)) {
    throw new Error(`Coluna fora do contrato: ${tabela}.${coluna}`)
  }
}

// Cliente falso que lança erro para qualquer tabela ou coluna fora de contrato.ts.
// Honra eq/in/gte/lte/order/limit sobre as linhas, então o teste não depende de como a consulta é montada.
// As opções são lidas no momento da resposta, para o teste poder mudá-las entre uma consulta e outra.
export function clienteContrato(opcoes: Opcoes = {}) {
  const limites: { tabela: string; limite: number | undefined }[] = []
  const inserts: { tabela: string; valor: Record<string, unknown> }[] = []

  const from = vi.fn((tabela: string) => {
    exigirTabela(tabela)
    let colunas = '*'
    const filtros: ((l: Record<string, unknown>) => boolean)[] = []
    let ordem: { coluna: string; asc: boolean } | null = null
    let limite: number | undefined

    const resposta = (): Promise<Resposta> => {
      if (opcoes.pendente) return new Promise(() => {})
      if (opcoes.erro) return Promise.resolve({ data: null, error: { message: 'falhou' } })
      let linhas = (opcoes.linhas?.[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
      if (ordem) {
        const { coluna, asc } = ordem
        linhas = [...linhas].sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna])) * (asc ? 1 : -1))
      }
      if (limite !== undefined) linhas = linhas.slice(0, limite)
      return Promise.resolve({ data: linhas, error: null })
    }

    const comparar = (coluna: string, teste: (v: string) => boolean) => {
      exigirColuna(tabela, coluna)
      filtros.push((l) => teste(String(l[coluna])))
    }

    const construtor: Record<string, unknown> = {
      select(cols = '*') {
        if (cols.trim() === '*') throw new Error(`select('*') fora do contrato em ${tabela}`)
        cols.split(',').forEach((c) => exigirColuna(tabela, c))
        colunas = cols
        return construtor
      },
      eq(coluna: string, valor: unknown) {
        exigirColuna(tabela, coluna)
        filtros.push((l) => l[coluna] === valor)
        return construtor
      },
      in(coluna: string, valores: unknown[]) {
        exigirColuna(tabela, coluna)
        filtros.push((l) => valores.includes(l[coluna]))
        return construtor
      },
      gte(coluna: string, valor: string) {
        comparar(coluna, (v) => v >= valor)
        return construtor
      },
      lte(coluna: string, valor: string) {
        comparar(coluna, (v) => v <= valor)
        return construtor
      },
      order(coluna: string, o?: { ascending?: boolean }) {
        exigirColuna(tabela, coluna)
        ordem = { coluna, asc: o?.ascending !== false }
        return construtor
      },
      limit(n: number) {
        limite = n
        limites.push({ tabela, limite: n })
        return construtor
      },
      insert: async (valor: Record<string, unknown>): Promise<Resposta> => {
        Object.keys(valor).forEach((c) => exigirColuna(tabela, c))
        inserts.push({ tabela, valor })
        if (opcoes.erroInsert) return { data: null, error: { message: 'falhou' } }
        return { data: null, error: null }
      },
      maybeSingle: () => resposta().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })),
      single: () => resposta().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })),
      then: (ok: (v: Resposta) => unknown, ko?: (e: unknown) => unknown) => resposta().then(ok, ko),
    }
    void colunas
    return construtor
  })

  return { cliente: { from } as unknown as SupabaseClient, from, limites, inserts }
}
