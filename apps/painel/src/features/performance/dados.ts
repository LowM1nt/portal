import type { SupabaseClient } from '@supabase/supabase-js'

export type Periodo = 7 | 30

export type EventoMetrica = {
  id: number
  ts: string
  tipo: string
  dados: Record<string, unknown>
}

export type Indicadores = {
  prsPorNoite: number | null
  taxaAprovacao: number | null
  tokensPorTarefa: number | null
  filaDificeis: number | null
  fallbacks: number
}

export type Resultado = { eventos: EventoMetrica[]; indicadores: Indicadores }

const DIA_MS = 24 * 60 * 60 * 1000
export const LIMITE = 1000
export const TIPOS = ['tarefa_metricas', 'noite_resumo', 'fallback_acionado']

// Campo ausente ou null não conta (nem como 0).
function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

export function calcular(eventos: EventoMetrica[]): Indicadores {
  const noites = eventos.filter((e) => e.tipo === 'noite_resumo')
  const tarefas = eventos.filter((e) => e.tipo === 'tarefa_metricas')

  const prs = noites.map((e) => numero(e.dados.prs) ?? 0)
  const tokens = tarefas
    .map((e) => {
      const entrada = numero(e.dados.tokens_entrada)
      const saida = numero(e.dados.tokens_saida)
      return entrada === null && saida === null ? null : (entrada ?? 0) + (saida ?? 0)
    })
    .filter((t): t is number => t !== null)
  const maisRecente = noites.reduce<EventoMetrica | null>(
    (acc, e) => (acc === null || Date.parse(e.ts) > Date.parse(acc.ts) ? e : acc),
    null,
  )

  return {
    prsPorNoite: prs.length ? prs.reduce((s, n) => s + n, 0) / prs.length : null,
    taxaAprovacao: tarefas.length
      ? tarefas.filter((e) => e.dados.resultado === 'pr_aberta').length / tarefas.length
      : null,
    tokensPorTarefa: tokens.length ? tokens.reduce((s, n) => s + n, 0) / tokens.length : null,
    filaDificeis: maisRecente ? numero(maisRecente.dados.fila_dificeis) : null,
    fallbacks: eventos.filter((e) => e.tipo === 'fallback_acionado').length,
  }
}

export async function buscarPerformance(cliente: SupabaseClient, periodo: Periodo): Promise<Resultado> {
  const inicio = new Date(Date.now() - periodo * DIA_MS).toISOString()
  // RLS do Supabase restringe as linhas ao dono.
  const { data, error } = await cliente
    .from('eventos')
    .select('id, ts, tipo, dados')
    .in('tipo', TIPOS)
    .gte('ts', inicio)
    .order('ts', { ascending: false })
    .limit(LIMITE)
  if (error) throw new Error(error.message)
  const eventos = (data as EventoMetrica[] | null) ?? []
  return { eventos, indicadores: calcular(eventos) }
}
