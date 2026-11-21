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
