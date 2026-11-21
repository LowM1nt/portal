const MIN = 60_000
const H = 60 * MIN
const DIA = 24 * H

/** "há 5 min", "há 3 h", "há 2 dias". A data atual vem por parâmetro para ser testável. */
export function haQuantoTempo(data: string, agora: Date): string {
  const ms = Math.max(0, agora.getTime() - new Date(data).getTime())
  if (ms < MIN) return 'agora'
  if (ms < H) return `há ${Math.floor(ms / MIN)} min`
  if (ms < DIA) return `há ${Math.floor(ms / H)} h`
  const dias = Math.floor(ms / DIA)
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}
