const inteiro = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

// 1353831 → "1,4 mi"; 760000 → "760 mil"; abaixo de mil, o número puro.
export function formatarNumero(n: number): string {
  const mil = Math.round(n / 1000)
  if (n >= 1_000_000 || mil >= 1000) return `${decimal.format(n / 1_000_000)} mi`
  return n >= 1000 ? `${inteiro.format(mil)} mil` : inteiro.format(n)
}
