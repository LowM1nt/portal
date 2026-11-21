import type { Deploy } from '../calendario/useDeploysDaSemana.ts'

export type Repositorio = { id: string; nome: string }

/** Como foi o deploy: marcado no detalhe (D-010: só concluido e falhou entram nas métricas). */
export type StatusDeploy = 'agendado' | 'concluido' | 'falhou' | 'cancelado'

export const STATUS_DEPLOY: Record<string, { nome: string; classe: string }> = {
  agendado: { nome: 'Agendado', classe: 'selo-andamento' },
  concluido: { nome: 'Concluído', classe: 'selo-ok' },
  falhou: { nome: 'Falhou', classe: 'selo-erro' },
  cancelado: { nome: 'Cancelado', classe: 'selo-neutro' },
}

export const AMBIENTES: Record<string, string> = { producao: 'produção', homologacao: 'homologação' }

export const LIMITES = { titulo: 200, ambiente: 50 }

export type NovoDeploy = { repositorioId: string; titulo: string; ambiente: string; agendadoPara: string }

type Api = (caminho: string, init?: RequestInit) => Promise<Response>

const json = (corpo: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
})

export const criarDeploy = (api: Api, deploy: NovoDeploy) => api('/api/deploys', { method: 'POST', ...json(deploy) })

export const mudarStatusDeploy = (api: Api, id: string, status: Exclude<StatusDeploy, 'cancelado'>) =>
  api(`/api/deploys/${encodeURIComponent(id)}/status`, { method: 'PATCH', ...json({ status }) })

export async function obterDeploy(api: Api, id: string): Promise<Deploy | null> {
  const r = await api(`/api/deploys/${encodeURIComponent(id)}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as Deploy
}

/**
 * Data e hora do formulário → instante. O calendário mostra o relógio em UTC (mesmo recorte de semana da API),
 * então o horário digitado é o que aparece no calendário.
 */
export const instanteDoFormulario = (data: string, hora: string) => `${data}T${hora}:00Z`
