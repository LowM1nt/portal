export type StatusBug = 'a_triar' | 'aberto' | 'em_andamento' | 'resolvido' | 'descartado'
export type Severidade = 'baixa' | 'media' | 'alta' | 'critica'

export type Bug = {
  id: string
  titulo: string
  relato: string
  passos: string
  esperado: string
  obtido: string
  severidade: Severidade
  origem: 'manual' | 'discord'
  status: StatusBug
  criadoEm: string
  atualizadoEm: string
}

export type NovoBug = {
  titulo: string
  relato: string
  passos: string
  esperado: string
  obtido: string
  severidade: Severidade
}

/** Limites iguais aos do servidor (BugsService): o cliente avisa antes de mandar. */
export const LIMITES = { titulo: 200, relato: 10000, campo: 4000 }

/** Selo (classe + palavra) de cada severidade e status: cor nunca vem sozinha. */
export const SEVERIDADES: Record<Severidade, { classe: string; nome: string }> = {
  critica: { classe: 'selo-erro', nome: 'Crítica' },
  alta: { classe: 'selo-erro', nome: 'Alta' },
  media: { classe: 'selo-aviso', nome: 'Média' },
  baixa: { classe: 'selo-neutro', nome: 'Baixa' },
}

export const STATUS: Record<StatusBug, { classe: string; nome: string }> = {
  a_triar: { classe: 'selo-andamento', nome: 'A triar' },
  aberto: { classe: 'selo-neutro', nome: 'Aberto' },
  em_andamento: { classe: 'selo-aviso', nome: 'Em andamento' },
  resolvido: { classe: 'selo-ok', nome: 'Resolvido' },
  descartado: { classe: 'selo-neutro', nome: 'Descartado' },
}

/** As três abas da lista; "aberto" conta como em andamento e "descartado" como resolvido. */
export const ABAS = [
  { id: 'a_triar', nome: 'A triar', status: ['a_triar'] },
  { id: 'andamento', nome: 'Em andamento', status: ['aberto', 'em_andamento'] },
  { id: 'resolvido', nome: 'Resolvido', status: ['resolvido', 'descartado'] },
] as const satisfies readonly { id: string; nome: string; status: readonly StatusBug[] }[]

export type Aba = (typeof ABAS)[number]['id']

export const abaDoStatus = (status: StatusBug): Aba =>
  ABAS.find((a) => (a.status as readonly StatusBug[]).includes(status))?.id ?? 'a_triar'

type Api = (caminho: string, init?: RequestInit) => Promise<Response>

const json = (corpo: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
})

export const criarBug = (api: Api, bug: NovoBug) => api('/api/bugs', { method: 'POST', ...json({ ...bug, origem: 'manual' }) })

export const moverBug = (api: Api, id: string, status: StatusBug) =>
  api(`/api/bugs/${encodeURIComponent(id)}/status`, { method: 'PATCH', ...json({ status }) })
