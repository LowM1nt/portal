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

export const IconeDeploys = () => (
  <Icone>
    <rect x="3" y="4" width="18" height="17" rx="3" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </Icone>
)

export const IconeRevisoes = () => (
  <Icone>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M6 8.5v7M18 15.5V10a4 4 0 0 0-4-4h-3" />
  </Icone>
)

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

export const IconeVoltar = () => (
  <Icone>
    <path d="M15 6l-6 6 6 6" />
  </Icone>
)

export const IconeAvancar = () => (
  <Icone>
    <path d="M9 6l6 6-6 6" />
  </Icone>
)

export const IconeSetaBaixo = () => (
  <Icone>
    <path d="M6 9l6 6 6-6" />
  </Icone>
)

export const IconeEntrar = () => (
  <Icone>
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M14 17l5-5-5-5M19 12H8" />
  </Icone>
)

export const IconeTime = () => (
  <Icone>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
  </Icone>
)

export const IconeInicio = () => (
  <Icone>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </Icone>
)

export const IconeBugs = () => (
  <Icone>
    <rect x="7" y="8" width="10" height="12" rx="5" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2M3 13h4M17 13h4M4 19l3-2M20 19l-3-2M4 7l3 2M20 7l-3 2" />
  </Icone>
)

export const IconeRoadmap = () => (
  <Icone>
    <path d="M4 6h10M4 12h16M4 18h7" />
    <circle cx="17" cy="6" r="2" />
    <circle cx="14" cy="18" r="2" />
  </Icone>
)

/** Três pontos: a aba "Mais" do celular. */
export const IconeMais = () => (
  <Icone>
    <circle cx="5" cy="12" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="19" cy="12" r="1.3" />
  </Icone>
)

/** Sinal de mais: criar alguma coisa. */
export const IconeNovo = () => (
  <Icone traco={2}>
    <path d="M12 5v14M5 12h14" />
  </Icone>
)

export const IconeMapa = () => (
  <Icone>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </Icone>
)

export const IconeDiscord = () => (
  <Icone>
    <path d="M8 7.5a14 14 0 0 1 8 0M7 16.5a14 14 0 0 0 10 0" />
    <path d="M7.5 6 5 6.8C3.3 9.5 2.6 12.4 3 16.5c1.5 1.2 3 1.8 4.5 2.1l1-2M16.5 6l2.5.8c1.7 2.7 2.4 5.6 2 9.7-1.5 1.2-3 1.8-4.5 2.1l-1-2" />
    <circle cx="9" cy="12.5" r="1.2" />
    <circle cx="15" cy="12.5" r="1.2" />
  </Icone>
)

export const IconePessoa = () => (
  <Icone>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icone>
)

export const IconeMetricas = () => (
  <Icone>
    <path d="M3 20h18M6 16l4-5 3 3 5-7" />
  </Icone>
)

export const IconeConfig = () => (
  <Icone>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
  </Icone>
)

export const IconeRepositorio = () => (
  <Icone>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </Icone>
)

export const IconeGithub = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
  </svg>
)

export const IconeEscudo = () => (
  <Icone>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icone>
)

export const IconeRelogio = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icone>
)

export const IconeLixo = () => (
  <Icone>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icone>
)

export const IconeLink = () => (
  <Icone>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icone>
)

export const IconeCopiar = () => (
  <Icone>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Icone>
)

export const IconeEnvelope = () => (
  <Icone>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Icone>
)

export const IconeMonitor = () => (
  <Icone>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Icone>
)
