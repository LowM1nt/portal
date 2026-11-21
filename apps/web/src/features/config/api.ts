/** GET /api/integracoes/github (D-004). O token nunca volta: só os 4 últimos caracteres. */
export type ConfigGithub = {
  configurado: boolean
  finalToken: string | null
  repositorios: string[]
  ultimaSincronizacao: string | null
  ultimoErro: string | null
  configuradoEm?: string | null
}

export type Membro = { usuarioId: string; email: string | null; papel: Papel; voce: boolean }

export type Papel = 'dono' | 'admin' | 'membro'

export type ConvitePendente = { id: string; email: string; papel: Papel; criadoEm: string; expiraEm: string }

export type ConviteCriado = ConvitePendente & { link: string }

export const PAPEIS: Record<Papel, { nome: string; classe: string; ajuda: string }> = {
  dono: { nome: 'Dono', classe: 'selo-andamento', ajuda: 'Muda integrações, convida e gerencia o time.' },
  admin: { nome: 'Admin', classe: 'selo-neutro', ajuda: 'Por enquanto, os mesmos poderes de membro.' },
  membro: { nome: 'Membro', classe: 'selo-neutro', ajuda: 'Usa o Releasy: deploys, revisões, bugs e roadmap.' },
}

export const REPOSITORIOS_MAXIMOS = 50

/** Mesmo formato que a API aceita: dono/repo, sem "." nem ".." como parte. */
export function repositorioValido(nome: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(nome) && !nome.split('/').some((p) => p === '.' || p === '..')
}

/** Aceita colar a URL do GitHub: "https://github.com/acme/portal" vira "acme/portal". */
export function normalizarRepositorio(texto: string): string {
  return texto
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
}

type Api = (caminho: string, init?: RequestInit) => Promise<Response>

export const json = (corpo: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
})

export async function lerConfigGithub(api: Api): Promise<ConfigGithub> {
  const r = await api('/api/integracoes/github')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const corpo = (await r.json()) as ConfigGithub
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || typeof corpo.configurado !== 'boolean') throw new Error('Resposta inválida')
  return { ...corpo, repositorios: Array.isArray(corpo.repositorios) ? corpo.repositorios : [] }
}

/** Sem `token`, só troca a lista de repositórios (o token guardado continua). */
export const salvarGithub = (api: Api, corpo: { token?: string; repositorios: string[] }) =>
  api('/api/integracoes/github', { method: 'PUT', ...json(corpo) })

export const removerGithub = (api: Api) => api('/api/integracoes/github', { method: 'DELETE' })

/** GET /api/integracoes/discord (D-006, D-014). O token nunca volta: só os 4 últimos caracteres. */
export type ConfigDiscord = {
  configurado: boolean
  finalToken: string | null
  canalId: string | null
  ultimaLeitura: string | null
  ultimoErro: string | null
  configuradoEm?: string | null
}

/** GET /api/integracoes/ia (D-007, D-014): só diz se há chave e de qual provedor (nem o final da chave volta). */
export type ConfigIa = { configurado: boolean; provedor: string | null }

/** Provedores que a API aceita hoje. */
export const PROVEDORES_IA = [{ id: 'gemini', nome: 'Google Gemini' }] as const

export const nomeProvedor = (id: string | null) => PROVEDORES_IA.find((p) => p.id === id)?.nome ?? id ?? ''

/** Mesmo formato que a API aceita: o ID (snowflake) do canal, só números. */
export const canalValido = (id: string) => /^[0-9]{17,20}$/.test(id)

/** Mesmos tetos da API (DiscordConfigService e IaConfigService). */
export const LIMITE_TOKEN_DISCORD = 200
export const LIMITE_CHAVE_IA = 500

function objeto<T extends { configurado: boolean }>(corpo: unknown): T {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || typeof (corpo as T).configurado !== 'boolean') {
    throw new Error('Resposta inválida')
  }
  return corpo as T
}

export async function lerConfigDiscord(api: Api): Promise<ConfigDiscord> {
  const r = await api('/api/integracoes/discord')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return objeto<ConfigDiscord>(await r.json())
}

/** Sem `token`, só troca o canal (o token guardado continua). */
export const salvarDiscord = (api: Api, corpo: { token?: string; canalId: string }) =>
  api('/api/integracoes/discord', { method: 'PUT', ...json(corpo) })

export const removerDiscord = (api: Api) => api('/api/integracoes/discord', { method: 'DELETE' })

export async function lerConfigIa(api: Api): Promise<ConfigIa> {
  const r = await api('/api/integracoes/ia')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return objeto<ConfigIa>(await r.json())
}

export const salvarIa = (api: Api, corpo: { provedor: string; chave: string }) => api('/api/integracoes/ia', { method: 'PUT', ...json(corpo) })

export const removerIa = (api: Api) => api('/api/integracoes/ia', { method: 'DELETE' })
