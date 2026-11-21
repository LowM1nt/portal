// Preferências do sistema lidas com segurança: em navegador antigo (ou no jsdom) matchMedia pode não existir.

function consulta(media: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(media).matches
  } catch {
    return false
  }
}

/** Quem pediu "reduzir movimento" não vê varredura, cascata nem halo andando. */
export const reduzirMovimento = (): boolean => consulta('(prefers-reduced-motion: reduce)')

/** O sistema prefere o tema claro? (o escuro é o padrão do Releasy) */
export const sistemaPrefereClaro = (): boolean => consulta('(prefers-color-scheme: light)')
