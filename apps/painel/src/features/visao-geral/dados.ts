import type { SupabaseClient } from '@supabase/supabase-js'

export type TarefaDaNoite = {
  id: number
  item: string
  ts: string
  resultado: string
  tentativas: number
  tokens: number
  segundos: number
  titulo: string | null
  estado: 'merge' | 'pr_aberta' | 'reprovada' | 'fila_dificeis'
}

export type DadosVisaoGeral = {
  noiteTs: string | null // null = nenhuma noite registrada ainda (sincronização e post continuam valendo)
  prs: number
  prsComMerge: number
  filaDificeis: number
  reprovadas: number
  minutosFora: number
  tarefas: TarefaDaNoite[] // todas as tentativas da noite (linha do tempo)
  itensDaNoite: TarefaDaNoite[] // uma por item, a tentativa mais recente (tabela)
  tokensDaNoite: number
  gastoNoMes: number // em R$
  sincronizadoEm: string | null
  proximoPost: { id: number; texto: string; publicaEm: string | null } | null
}

export type ResultadoVisaoGeral = DadosVisaoGeral

type Linha = { id: number; ts: string; tipo: string; dados: Record<string, unknown> | null }

export const LIMITE_TAREFAS = 200
// Teto do PostgREST: acima disso o gasto do mês seria cortado em silêncio.
export const LIMITE_MES = 1000
export const COTACAO_DOLAR = 5.4
const JANELA_DA_NOITE_MS = 12 * 60 * 60 * 1000

// Campo ausente ou null não conta (nem como 0).
function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
}

function custoEmReais(dados: Record<string, unknown> | null): number {
  return dados?.perfil === 'assinatura' ? 0 : numero(dados?.custo_usd) * COTACAO_DOLAR
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
    cliente.from('posts').select('id, texto, publicar_em').gte('publicar_em', agora.toISOString()).order('publicar_em', { ascending: true }).limit(1),
    cliente.from('eventos').select('id, ts, tipo, dados').eq('tipo', 'tarefa_metricas').gte('ts', inicioDoMes).limit(LIMITE_MES),
  ])
  const resumo = lancar<Linha[]>(resumos)[0]
  const ultimaVez = lancar<{ ultima_vez: string | null }[]>(sync)[0]?.ultima_vez ?? null
  // posts não está detalhado em docs/eventos.md: se falhar, a tela segue sem o próximo post.
  const post = posts.error ? undefined : ((posts.data ?? []) as { id: number; texto: string | null; publicar_em: string | null }[])[0]
  const gastoNoMes = lancar<Linha[]>(mes).reduce((soma, l) => soma + custoEmReais(l.dados), 0)
  const proximoPost = post ? { id: post.id, texto: post.texto ?? '', publicaEm: post.publicar_em } : null

  if (!resumo) {
    return {
      noiteTs: null,
      prs: 0,
      prsComMerge: 0,
      filaDificeis: 0,
      reprovadas: 0,
      minutosFora: 0,
      tarefas: [],
      itensDaNoite: [],
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
  // Merge acontece quando o dono aprova a PR, depois do fim da noite: sem teto em resumo.ts.
  const [mergeadas, planejadasDaNoite] = await Promise.all(
    (['tarefa_mergeada', 'tarefa_planejada'] as const).map(async (tipo) =>
      lancar<Linha[]>(
        await cliente
          .from('eventos')
          .select('id, ts, tipo, dados')
          .eq('tipo', tipo)
          .gte('ts', inicioDaNoite)
          .order('ts', { ascending: true })
          .limit(LIMITE_TAREFAS),
      ),
    ),
  )
  const eventosDaNoite = [...mergeadas, ...planejadasDaNoite]
  const itemDe = (l: Linha) => (typeof l.dados?.item === 'string' ? l.dados.item : '')
  // só itens desta noite: merge de PR antiga não conta, e o plano da noite seguinte não sobrescreve este
  const itensDaNoite = new Set(metricas.map(itemDe))
  const mergeados = new Set(eventosDaNoite.filter((l) => l.tipo === 'tarefa_mergeada').map(itemDe).filter((i) => itensDaNoite.has(i)))
  const planejadas = new Map<string, Record<string, unknown>>()
  for (const l of eventosDaNoite)
    if (l.tipo === 'tarefa_planejada' && l.dados && Date.parse(l.ts) <= Date.parse(resumo.ts)) planejadas.set(itemDe(l), l.dados)

  const tarefas: TarefaDaNoite[] = metricas.map((l) => {
    const item = itemDe(l)
    const plano = planejadas.get(item)
    const resultado = typeof l.dados?.resultado === 'string' ? l.dados.resultado : ''
    const estado: TarefaDaNoite['estado'] = mergeados.has(item)
      ? 'merge'
      : plano?.estado === 'fila_dificeis'
        ? 'fila_dificeis'
        : resultado === 'reprovada'
          ? 'reprovada'
          : 'pr_aberta'
    return {
      id: l.id,
      item,
      ts: l.ts,
      resultado,
      tentativas: numero(l.dados?.tentativas),
      tokens: tokensDe(l.dados),
      segundos: numero(l.dados?.segundos_modelo),
      titulo: typeof plano?.titulo === 'string' && plano.titulo !== '' ? plano.titulo : null,
      estado,
    }
  })

  // Uma linha por item: a tentativa mais recente (as métricas vêm em ordem crescente de ts).
  const maisRecentes = new Map<string, TarefaDaNoite>()
  for (const t of tarefas) maisRecentes.set(t.item || `#${t.id}`, t)

  return {
    noiteTs: resumo.ts,
    prs: numero(resumo.dados?.prs),
    prsComMerge: mergeados.size,
    filaDificeis: numero(resumo.dados?.fila_dificeis),
    reprovadas: numero(resumo.dados?.reprovadas),
    minutosFora: numero(resumo.dados?.minutos_fora),
    tarefas,
    itensDaNoite: [...maisRecentes.values()],
    tokensDaNoite: metricas.reduce((s, l) => s + tokensDe(l.dados), 0),
    gastoNoMes,
    sincronizadoEm: ultimaVez,
    proximoPost,
  }
}
