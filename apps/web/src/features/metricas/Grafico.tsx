import { useId } from 'react'
import { caminhoSuave, trechos } from './curva.ts'

type Props = {
  /** Um valor por semana, da mais antiga para a mais nova; `null` = semana sem amostra (vira um vão na linha). */
  valores: (number | null)[]
  rotulos: string[]
  formatar: (valor: number) => string
  /** Nome do gráfico para leitor de tela. */
  titulo: string
}

const L = 600
const A = 200
const MARGEM = 12

/**
 * Gráfico de linha suave com área em degradê do roxo ao transparente (SVG próprio, sem biblioteca).
 * O SVG estica na largura; rótulos e pontos ficam em HTML, em porcentagem, para o texto não deformar.
 */
export function Grafico({ valores, rotulos, formatar, titulo }: Props) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const reais = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  const maximo = Math.max(...reais, 0) * 1.15 || 1
  const n = valores.length
  const fracao = (i: number) => (n <= 1 ? 0.5 : i / (n - 1))
  const y = (v: number) => MARGEM + (1 - v / maximo) * (A - 2 * MARGEM)
  const partes = trechos(valores).map((t) => t.map((p) => ({ ...p, x: fracao(p.i) * L, y: y(p.valor) })))
  const ultimo = partes.at(-1)?.at(-1) ?? null
  const passo = Math.ceil(n / 6)
  const resumo = ultimo
    ? `${titulo}: ${reais.length} de ${n} semanas com dados; a última com dados, ${formatar(ultimo.valor)} na semana de ${rotulos[ultimo.i]}.`
    : `${titulo}: sem dados no período.`
  const pontos = partes.filter((p, i) => p.length === 1 || i === partes.length - 1).map((p) => p[p.length - 1])
  // Rótulos contados a partir da última semana (a mais importante), sempre com o mesmo espaço entre eles.
  const visiveis = rotulos.map((r, i) => ({ r, i })).filter(({ i }) => (n - 1 - i) % passo === 0)

  return (
    <figure className="grafico" role="img" aria-label={resumo}>
      <div className="grafico-area" aria-hidden="true">
        <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--roxo)" stopOpacity=".32" />
              <stop offset="1" stopColor="var(--roxo)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} className="grafico-grade" x1="0" x2={L} y1={MARGEM + f * (A - 2 * MARGEM)} y2={MARGEM + f * (A - 2 * MARGEM)} />
          ))}
          {partes.map((p) => {
            const d = caminhoSuave(p)
            const base = A - MARGEM
            return (
              <g key={p[0].i}>
                {p.length > 1 && <path d={`${d} L${p[p.length - 1].x},${base} L${p[0].x},${base} Z`} fill={`url(#${id})`} />}
                <path className="grafico-linha" d={d} />
              </g>
            )
          })}
        </svg>
        {reais.length > 0 ? (
          <span className="grafico-max">{formatar(Math.max(...reais))}</span>
        ) : (
          <span className="grafico-sem-dados">Sem dados no período</span>
        )}
        {pontos.map((p) => (
          <i key={p.i} className="grafico-ponto" style={{ left: `${(p.x / L) * 100}%`, top: `${(p.y / A) * 100}%` }} />
        ))}
      </div>
      <figcaption className="grafico-eixo" aria-hidden="true">
        {visiveis.map(({ r, i }) => (
          <span
            key={i}
            className={[
              i === 0 && n > 1 ? 'grafico-eixo-ini' : i === n - 1 && n > 1 ? 'grafico-eixo-fim' : '',
              // No celular cabe a metade: some um rótulo sim, outro não (contando da última semana).
              ((n - 1 - i) / passo) % 2 === 1 ? 'grafico-eixo-alt' : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined}
            style={{ left: `${fracao(i) * 100}%` }}
          >
            {r}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
