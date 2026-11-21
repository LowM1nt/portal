import type { ReactNode } from 'react'

// Ícones de linha fina arredondada (no estilo Lucide), desenhados aqui para não trazer dependência.
// Sempre decorativos: quem dá o nome é o botão ou o texto ao lado.
function Icone({ children, traco = 1.8 }: { children: ReactNode; traco?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}



export const IconeBusca = () => (
  <Icone>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icone>
)

export const IconeSol = () => (
  <Icone>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icone>
)

export const IconeLua = () => (
  <Icone>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Icone>
)

export const IconeSair = () => (
  <Icone>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  </Icone>
)

export const IconeX = () => (
  <Icone traco={2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icone>
)

export const IconeCheck = () => (
  <Icone traco={2.4}>
    <path d="M5 12l5 5 9-10" />
  </Icone>
)

export const IconeAlerta = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 17h.01" />
  </Icone>
)

export const IconeInfo = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5h.01" />
  </Icone>
)

export const IconeVisao = () => (
  <Icone>
    <rect x="3" y="3" width="7.5" height="9" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="2" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="2" />
    <rect x="3" y="15" width="7.5" height="6" rx="2" />
  </Icone>
)

export const IconePerformance = () => (
  <Icone>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M7 15l4-5 3 3 5-6" />
  </Icone>
)

export const IconePausa = () => (
  <Icone traco={2}>
    <path d="M9 5v14M15 5v14" />
  </Icone>
)

export const IconePost = () => (
  <Icone>
    <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4z" />
    <path d="M8 8h8M8 12h5" />
  </Icone>
)

export const IconeTroca = () => (
  <Icone>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Icone>
)
