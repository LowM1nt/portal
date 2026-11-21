import type { ItemRoadmap } from './api.ts'

const DIA = 86_400_000

export type Mes = { chave: number; rotulo: string; esquerda: number; largura: number }
export type Barra = { item: ItemRoadmap; esquerda: number; largura: number }
export type LinhaDoTempo = { meses: Mes[]; barras: Barra[]; hoje: number | null; semPrazo: ItemRoadmap[] }

const mesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })

const diaDoPrazo = (prazo: string) => {
  const [a, m, d] = prazo.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}
const indiceMes = (t: number) => {
  const d = new Date(t)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}
const inicioDoMes = (indice: number) => Date.UTC(Math.floor(indice / 12), indice % 12, 1)

/**
 * Linha do tempo do roadmap, em porcentagens da largura. Cada item vai de quando foi criado até
 * o prazo. A janela mostra de 4 a 12 meses, começando no máximo 2 meses antes do mês atual.
 * Itens sem prazo ficam fora das barras (`semPrazo`).
 */
export function montarLinhaDoTempo(itens: ItemRoadmap[], hoje: Date): LinhaDoTempo {
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const semPrazo = itens.filter((i) => !i.prazo)
  const intervalos = itens
    .filter((i): i is ItemRoadmap & { prazo: string } => Boolean(i.prazo))
    .map((item) => {
      const fim = diaDoPrazo(item.prazo)
      const criado = new Date(item.criadoEm)
      const criadoDia = Date.UTC(criado.getUTCFullYear(), criado.getUTCMonth(), criado.getUTCDate())
      return { item, inicio: Math.min(Number.isNaN(criadoDia) ? fim : criadoDia, fim), fim }
    })
    .sort((a, b) => a.fim - b.fim || a.inicio - b.inicio)

  if (intervalos.length === 0) return { meses: [], barras: [], hoje: null, semPrazo }

  const mesAtual = indiceMes(hojeUtc)
  const primeiro = Math.max(Math.min(mesAtual, ...intervalos.map((b) => indiceMes(b.inicio))), mesAtual - 2)
  const ultimo = Math.min(Math.max(mesAtual, primeiro + 3, ...intervalos.map((b) => indiceMes(b.fim))), primeiro + 11)
  const janelaInicio = inicioDoMes(primeiro)
  const janelaFim = inicioDoMes(ultimo + 1)
  const pct = (t: number) => ((Math.min(Math.max(t, janelaInicio), janelaFim) - janelaInicio) / (janelaFim - janelaInicio)) * 100

  const anoAtual = Math.floor(mesAtual / 12)
  const meses: Mes[] = []
  for (let m = primeiro; m <= ultimo; m++) {
    const nome = mesCurto.format(inicioDoMes(m)).replace('.', '')
    const rotulo = nome.charAt(0).toUpperCase() + nome.slice(1) + (Math.floor(m / 12) !== anoAtual ? `/${String(Math.floor(m / 12)).slice(2)}` : '')
    meses.push({ chave: m, rotulo, esquerda: pct(inicioDoMes(m)), largura: pct(inicioDoMes(m + 1)) - pct(inicioDoMes(m)) })
  }

  // Barra mínima de 2% para o item não sumir; nunca passa da borda direita.
  const barras = intervalos.map(({ item, inicio, fim }) => {
    const largura = Math.max(pct(fim + DIA) - pct(inicio), 2)
    return { item, esquerda: Math.min(pct(inicio), 100 - largura), largura }
  })

  const hojePct = hojeUtc >= janelaInicio && hojeUtc < janelaFim ? pct(hojeUtc) : null
  return { meses, barras, hoje: hojePct, semPrazo }
}
