import { useCallback, useEffect, useState } from 'react'

/** Telas que existem hoje na casca autenticada. */
export type Destino = 'deploys' | 'revisoes'

const DESTINOS: readonly Destino[] = ['deploys', 'revisoes']

function lerDestino(): Destino {
  const caminho = window.location.hash.replace(/^#\/?/, '')
  return DESTINOS.find((d) => d === caminho) ?? 'deploys'
}

export const hrefDe = (destino: Destino) => `#/${destino}`

/** Destino atual guardado no hash (#/deploys, #/revisoes): dá para voltar com o botão do navegador. */
export function useDestino(): [Destino, (destino: Destino) => void] {
  const [destino, setDestino] = useState(lerDestino)

  useEffect(() => {
    const sincronizar = () => setDestino(lerDestino())
    window.addEventListener('hashchange', sincronizar)
    window.addEventListener('popstate', sincronizar)
    return () => {
      window.removeEventListener('hashchange', sincronizar)
      window.removeEventListener('popstate', sincronizar)
    }
  }, [])

  const ir = useCallback((novo: Destino) => {
    if (window.location.hash !== hrefDe(novo)) window.history.pushState(null, '', hrefDe(novo))
    setDestino(novo)
  }, [])

  return [destino, ir]
}
