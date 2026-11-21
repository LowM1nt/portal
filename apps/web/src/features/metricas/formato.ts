/** Contrato de GET /api/metricas (D-010). Sem amostra, `valor` vem nulo (nunca 0 inventado). */
export type Metrica = { valor: number | null; anterior: number | null; variacao: number | null }

export type SemanaMetricas = {
  inicio: string
  fim: string
  deploys: number
  falhas: number
  taxaDeFalha: number | null
  tempoAteDeployHoras: number | null
  tempoParaRecuperarHoras: number | null
}

export type Metricas = {
  semanas: number
  inicio: string
  fim: string
  deploysPorDia: Metrica
  tempoAteDeployHoras: Metrica
  taxaDeFalha: Metrica
  tempoParaRecuperarHoras: Metrica
  series: SemanaMetricas[]
}

const num = (casas: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 })
const n0 = num(0)
const n1 = num(1)

/** Frequência: "2,1/dia"; abaixo de 1 por dia fica mais legível por semana ("3,5/semana"). */
export function formatarFrequencia(porDia: number): string {
  if (porDia === 0) return '0/semana'
  if (porDia >= 1) return `${n1.format(porDia)}/dia`
  return `${n1.format(porDia * 7)}/semana`
}

/** Duração em horas → "35 min", "5,5 h" ou "1,8 d" (vírgula decimal, como no guia). */
export function formatarDuracao(horas: number): string {
  if (horas < 1) return `${n0.format(Math.max(1, Math.round(horas * 60)))} min`
  if (horas < 48) return `${n1.format(horas)} h`
  return `${n1.format(horas / 24)} d`
}

export const formatarTaxa = (pct: number) => `${n1.format(pct)}%`

export type Tendencia = 'melhor' | 'pior' | 'igual'

/** Variação em % e se ela é boa: para a frequência, subir é bom; para as outras três, descer é bom. */
export function descreverVariacao(variacao: number | null, subirEBom: boolean): { texto: string; tendencia: Tendencia } | null {
  if (variacao === null) return null
  if (Math.abs(variacao) < 0.05) return { texto: 'Igual ao anterior', tendencia: 'igual' }
  const sinal = variacao > 0 ? '+' : '−'
  const melhor = variacao > 0 === subirEBom
  return { texto: `${sinal}${n1.format(Math.abs(variacao))}% vs. anterior`, tendencia: melhor ? 'melhor' : 'pior' }
}

const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/** Rótulo da semana no eixo: o dia em que ela começa ("09/11"). */
export const rotuloSemana = (s: SemanaMetricas) => diaMes.format(new Date(s.inicio))

/** Teve algum deploy concluído ou que falhou no período? Sem isso as métricas não dizem nada. */
export const temDados = (m: Metricas) => m.series.some((s) => s.deploys + s.falhas > 0)

export const PERIODOS = [4, 12] as const
export type Periodo = (typeof PERIODOS)[number]

/** Período da rota (`#/metricas?p=4`); padrão 12 semanas, como a API. */
export const periodoDaRota = (params: URLSearchParams): Periodo => (params.get('p') === '4' ? 4 : 12)
