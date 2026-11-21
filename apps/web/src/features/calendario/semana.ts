const DIA_MS = 24 * 60 * 60 * 1000

function utc(ano: number, mes: number, dia: number): number {
  return Date.UTC(ano, mes, dia)
}

/** Segunda-feira (UTC, meia-noite) da semana ISO 1 do ano. */
function inicioSemana1(ano: number): number {
  const quatroJan = utc(ano, 0, 4)
  const diaSemana = (new Date(quatroJan).getUTCDay() + 6) % 7 // segunda = 0
  return quatroJan - diaSemana * DIA_MS
}

function rotulo(ano: number, semana: number): string {
  return `${ano}-W${String(semana).padStart(2, '0')}`
}

function segundaDe(r: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(r)
  if (!m) throw new Error(`Rótulo de semana inválido: ${r}`)
  return inicioSemana1(Number(m[1])) + (Number(m[2]) - 1) * 7 * DIA_MS
}

/** Rótulo ISO 'AAAA-Www' da semana que contém a data (dia local). */
export function rotuloSemana(data: Date): string {
  const dia = utc(data.getFullYear(), data.getMonth(), data.getDate())
  const quintaFeira = dia + (3 - ((new Date(dia).getUTCDay() + 6) % 7)) * DIA_MS
  const ano = new Date(quintaFeira).getUTCFullYear()
  return rotulo(ano, Math.floor((quintaFeira - inicioSemana1(ano)) / (7 * DIA_MS)) + 1)
}

function deslocar(r: string, semanas: number): string {
  const d = new Date(segundaDe(r) + semanas * 7 * DIA_MS)
  return rotuloSemana(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export const semanaAnterior = (r: string): string => deslocar(r, -1)
export const proximaSemana = (r: string): string => deslocar(r, 1)

/** Os 7 dias (segunda a domingo) da semana, em datas locais. */
export function diasDaSemana(r: string): Date[] {
  const s = new Date(segundaDe(r))
  return Array.from({ length: 7 }, (_, i) => new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + i))
}

/** Chave 'AAAA-MM-DD' de uma data local. */
export function chaveDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Chave 'AAAA-MM-DD' do dia UTC de um instante (mesmo recorte de semana da API). */
export function chaveDiaUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const mesLongo = new Intl.DateTimeFormat('pt-BR', { month: 'long' })
const mesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

/** "16 a 22 de novembro" ou, virando o mês, "30 de nov. a 6 de dez.". */
export function periodo(dias: Date[]): string {
  const [inicio, fim] = [dias[0], dias[dias.length - 1]]
  if (inicio.getMonth() === fim.getMonth()) return `${inicio.getDate()} a ${fim.getDate()} de ${mesLongo.format(fim)}`
  return `${inicio.getDate()} de ${mesCurto.format(inicio)} a ${fim.getDate()} de ${mesCurto.format(fim)}`
}
