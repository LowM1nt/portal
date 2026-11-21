/** Linha suave (curva de Bézier entre pontos vizinhos, sem passar do valor real na vertical). */
export function caminhoSuave(pontos: { x: number; y: number }[]): string {
  if (pontos.length === 0) return ''
  let d = `M${pontos[0].x},${pontos[0].y}`
  for (let i = 1; i < pontos.length; i++) {
    const [a, b] = [pontos[i - 1], pontos[i]]
    const meio = (a.x + b.x) / 2
    d += ` C${meio},${a.y} ${meio},${b.y} ${b.x},${b.y}`
  }
  return d
}

/** Pedaços de pontos seguidos (uma semana sem amostra quebra a linha). */
export function trechos(valores: (number | null)[]): { valor: number; i: number }[][] {
  const lista: { valor: number; i: number }[][] = []
  let atual: { valor: number; i: number }[] = []
  valores.forEach((valor, i) => {
    if (valor === null || !Number.isFinite(valor)) {
      if (atual.length) lista.push(atual)
      atual = []
    } else atual.push({ valor, i })
  })
  if (atual.length) lista.push(atual)
  return lista
}
