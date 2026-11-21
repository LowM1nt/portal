/** Logo `m1nt.`: só tipografia, minúsculas, com o ponto roxo na linha de base (padrão do Releasy). */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`logo ${className}`.trim()} role="img" aria-label="m1nt.">
      m1nt
      <i className="logo-ponto" aria-hidden="true" />
    </span>
  )
}

/** Ícone pequeno `m.` (topo do dock). */
export function LogoCurto() {
  return (
    <span className="logo logo-curto" role="img" aria-label="m1nt.">
      m
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
