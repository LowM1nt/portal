/** Logo `releasy.`: só tipografia, com o ponto roxo na linha de base. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`logo ${className}`.trim()} role="img" aria-label="Releasy">
      releasy
      <i className="logo-ponto" aria-hidden="true" />
    </span>
  )
}

/** Ícone pequeno `r.` (topo do dock). */
export function LogoCurto() {
  return (
    <span className="logo logo-curto" role="img" aria-label="Releasy">
      r
      <i className="logo-ponto" aria-hidden="true" />
    </span>
  )
}

/** Fundo Aurora: dois halos que andam devagar, só com transform (parados com "reduzir movimento"). */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <i className="aurora-a" />
      <i className="aurora-b" />
    </div>
  )
}
