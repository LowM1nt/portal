import type { Rota } from '../../ui/rota.ts'

export type Visao = 'quadro' | 'tempo'

export const visaoDaRota = (rota: Rota): Visao => (rota.params.get('v') === 'tempo' ? 'tempo' : 'quadro')

/** Endereço do roadmap mantendo a visão atual: `#/roadmap/novo?v=tempo`. */
export const hrefRoadmap = (visao: Visao, item?: string) =>
  `#/roadmap${item ? `/${encodeURIComponent(item)}` : ''}${visao === 'tempo' ? '?v=tempo' : ''}`
