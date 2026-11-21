import type { Bug, Severidade } from '../bugs/api.ts'
import { json } from '../config/api.ts'

/**
 * Sugestão da IA para um bug (D-007, D-014). Fica separada do bug: os campos do bug são o que alguém do time
 * escreveu ou confirmou; isto é só o que a IA achou. Todo texto daqui veio de fora (relato do Discord, resposta
 * da IA) e é mostrado sempre como texto puro.
 */
export type StatusSugestao = 'pendente' | 'pronta' | 'falhou' | 'cancelada' | 'aprovada' | 'ajustada' | 'descartada'

export type Sugestao = {
  status: StatusSugestao
  severidade: Severidade | null
  area: string | null
  passos: string
  esperado: string
  obtido: string
  ambiente: string
  confianca: number | null
  evidencias: string[]
  erro: string | null
}

/** Bug parecido no mesmo workspace (nota de 0 a 100). */
export type Duplicado = { bugId: string; titulo: string; similaridade: number }

/** GET /api/triagem: bugs "a triar" (até 100, mais novos primeiro). */
export type ItemTriagem = {
  bugId: string
  titulo: string
  relato: string
  origem: 'manual' | 'discord'
  autor: string | null
  severidade: Severidade
  criadoEm: string
  sugestao: Sugestao | null
  possivelDuplicado: Duplicado | null
}

/** Enquanto a IA lê algum relato, a fila se atualiza sozinha nesse intervalo (o processador roda a cada 15 s). */
export const INTERVALO_PENDENTE = 15_000

export type AcaoTriagem = 'aprovar' | 'ajustar' | 'descartar'

/** Resposta do POST /api/triagem/{bugId}: o bug como ficou e a sugestão com o status novo. */
export type ResultadoTriagem = { bug: Bug; sugestao: Sugestao | null }

type Api = (caminho: string, init?: RequestInit) => Promise<Response>

export async function lerTriagem(api: Api): Promise<ItemTriagem[]> {
  const r = await api('/api/triagem')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const corpo: unknown = await r.json()
  if (!Array.isArray(corpo)) throw new Error('Resposta inválida')
  return (corpo as ItemTriagem[]).filter((i) => i && typeof i.bugId === 'string')
}

export const triar = (api: Api, bugId: string, acao: AcaoTriagem, severidade?: Severidade) =>
  api(`/api/triagem/${encodeURIComponent(bugId)}`, { method: 'POST', ...json(severidade ? { acao, severidade } : { acao }) })

/** Evidências chegam como lista de textos curtos; qualquer outra coisa vira lista vazia. */
export const evidencias = (s: Sugestao) => (Array.isArray(s.evidencias) ? s.evidencias.filter((e) => typeof e === 'string' && e.trim()) : [])

/** Confiança entre 0 e 100 (ou null se a IA não disse). */
export const confianca = (s: Sugestao) =>
  typeof s.confianca === 'number' && Number.isFinite(s.confianca) ? Math.min(Math.max(Math.round(s.confianca), 0), 100) : null
