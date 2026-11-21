export type StatusItem = 'ideia' | 'planejado' | 'em_andamento' | 'entregue'

export type ItemRoadmap = {
  id: string
  titulo: string
  descricao: string | null
  status: StatusItem
  /** Data sem hora, 'AAAA-MM-DD'. */
  prazo: string | null
  progresso: number
  deployId: string | null
  pullRequestId: string | null
  criadoEm: string
  atualizadoEm: string
}

export type DadosItem = { titulo: string; descricao: string; status: StatusItem; prazo: string; progresso: number }

export const TITULO_MAXIMO = 200

export const COLUNAS: { status: StatusItem; nome: string }[] = [
  { status: 'ideia', nome: 'Ideias' },
  { status: 'planejado', nome: 'Planejado' },
  { status: 'em_andamento', nome: 'Em andamento' },
  { status: 'entregue', nome: 'Entregue' },
]

export const NOME_STATUS: Record<StatusItem, string> = {
  ideia: 'Ideia',
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  entregue: 'Entregue',
}

type Api = (caminho: string, init?: RequestInit) => Promise<Response>

const json = (metodo: string, corpo: unknown): RequestInit => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
})

function pedido(d: DadosItem, original?: ItemRoadmap) {
  return {
    titulo: d.titulo.trim(),
    descricao: d.descricao.trim() || null,
    status: d.status,
    prazo: d.prazo || null,
    progresso: d.progresso,
    // O PUT grava tudo: a ligação com deploy/PR precisa voltar como estava.
    deployId: original?.deployId ?? null,
    pullRequestId: original?.pullRequestId ?? null,
  }
}

export const criarItem = (api: Api, d: DadosItem) => api('/api/roadmap', json('POST', pedido(d)))

export const editarItem = (api: Api, original: ItemRoadmap, d: DadosItem) =>
  api(`/api/roadmap/${encodeURIComponent(original.id)}`, json('PUT', pedido(d, original)))

export const moverItem = (api: Api, id: string, status: StatusItem) =>
  api(`/api/roadmap/${encodeURIComponent(id)}/status`, json('PATCH', { status }))

const prazoCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** '2026-12-12' → "12 de dez." */
export const formatarPrazo = (prazo: string) => prazoCurto.format(new Date(`${prazo}T00:00:00Z`))

/** Prazo que já passou sem o item ter sido entregue. */
export function atrasado(item: ItemRoadmap, hoje: Date): boolean {
  if (!item.prazo || item.status === 'entregue') return false
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
  return item.prazo < dia
}
