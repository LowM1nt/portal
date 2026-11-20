import type { SupabaseClient } from '@supabase/supabase-js'

export type TarefaDaNoite = {
  id: number
  item: string
  ts: string
  resultado: string
  tentativas: number
  tokens: number
  segundos: number
}

export type DadosVisaoGeral = {
  noiteTs: string | null // null = nenhuma noite registrada ainda (sincronização e post continuam valendo)
  prs: number
  filaDificeis: number
  reprovadas: number
  minutosFora: number
  tarefas: TarefaDaNoite[]
  tokensDaNoite: number
  gastoNoMes: number
  sincronizadoEm: string | null
  proximoPost: { id: number; texto: string; publicaEm: string | null } | null
}

export type ResultadoVisaoGeral = DadosVisaoGeral

type Linha = { id: number; ts: string; tipo: string; dados: Record<string, unknown> | null }

export const LIMITE_TAREFAS = 200
// Teto do PostgREST: acima disso o gasto do mês seria cortado em silêncio.
export const LIMITE_MES = 1000
const JANELA_DA_NOITE_MS = 12 * 60 * 60 * 1000

// Campo ausente ou null não conta (nem como 0).
function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
}

function tokensDe(dados: Record<string, unknown> | null): number {
  return numero(dados?.tokens_entrada) + numero(dados?.tokens_saida)
}

// Início do mês em America/Sao_Paulo (UTC−3, sem horário de verão desde 2019), em ISO UTC.
function inicioDoMesEmSaoPaulo(agora: Date): string {
  const local = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3)).toISOString()
}

function lancar<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data ?? ([] as unknown as T)
}

export async function buscarVisaoGeral(cliente: SupabaseClient): Promise<ResultadoVisaoGeral> {
  // RLS do Supabase restringe as linhas ao dono; aqui só pedimos o recorte recente.
  const agora = new Date()
  const inicioDoMes = inicioDoMesEmSaoPaulo(agora)
  const [resumos, sync, posts, mes] = await Promise.all([
    cliente.from('eventos').select('id, ts, tipo, dados').eq('tipo', 'noite_resumo').order('ts', { ascending: false }).limit(1),
    cliente.from('sincronizacao').select('ultima_vez').order('ultima_vez', { ascending: false }).limit(1),
    cliente.from('posts').select('id, texto, publica_em').gte('publica_em', agora.toISOString()).order('publica_em', { ascending: true }).limit(1),
    cliente.from('eventos').select('id, ts, tipo, dados').eq('tipo', 'tarefa_metricas').gte('ts', inicioDoMes).limit(LIMITE_MES),
  ])
  const resumo = lancar<Linha[]>(resumos)[0]
  const ultimaVez = lancar<{ ultima_vez: string | null }[]>(sync)[0]?.ultima_vez ?? null
  // posts não está detalhado em docs/eventos.md: se falhar, a tela segue sem o próximo post.
  const post = posts.error ? undefined : ((posts.data ?? []) as { id: number; texto: string | null; publica_em: string | null }[])[0]
  const gastoNoMes = lancar<Linha[]>(mes).reduce((soma, l) => soma + tokensDe(l.dados), 0)
  const proximoPost = post ? { id: post.id, texto: post.texto ?? '', publicaEm: post.publica_em } : null

  if (!resumo) {
    return {
      noiteTs: null,
      prs: 0,
      filaDificeis: 0,
      reprovadas: 0,
      minutosFora: 0,
      tarefas: [],
      tokensDaNoite: 0,
      gastoNoMes,
      sincronizadoEm: ultimaVez,
      proximoPost,
    }
  }

  const inicioDaNoite = new Date(Date.parse(resumo.ts) - JANELA_DA_NOITE_MS).toISOString()
  const metricas = lancar<Linha[]>(
    await cliente
      .from('eventos')
      .select('id, ts, tipo, dados')
      .eq('tipo', 'tarefa_metricas')
      .gte('ts', inicioDaNoite)
      .lte('ts', resumo.ts)
      .order('ts', { ascending: true })
      .limit(LIMITE_TAREFAS),
  )
  const tarefas = metricas.map((l) => ({
    id: l.id,
    item: typeof l.dados?.item === 'string' ? l.dados.item : '',
    ts: l.ts,
    resultado: typeof l.dados?.resultado === 'string' ? l.dados.resultado : '',
    tentativas: numero(l.dados?.tentativas),
    tokens: tokensDe(l.dados),
    segundos: numero(l.dados?.segundos_modelo),
  }))

  return {
    noiteTs: resumo.ts,
    prs: numero(resumo.dados?.prs),
    filaDificeis: numero(resumo.dados?.fila_dificeis),
    reprovadas: numero(resumo.dados?.reprovadas),
    minutosFora: numero(resumo.dados?.minutos_fora),
    tarefas,
    tokensDaNoite: tarefas.reduce((s, t) => s + t.tokens, 0),
    gastoNoMes,
    sincronizadoEm: ultimaVez,
    proximoPost,
  }
}
