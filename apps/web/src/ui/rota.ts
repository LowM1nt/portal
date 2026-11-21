import { useCallback, useEffect, useState } from 'react'

/** Telas que existem na casca autenticada. "Mais" só aparece como aba no celular. */
export type Destino = 'inicio' | 'deploys' | 'revisoes' | 'bugs' | 'roadmap' | 'metricas' | 'config' | 'conta' | 'mais'

const DESTINOS: readonly Destino[] = ['inicio', 'deploys', 'revisoes', 'bugs', 'roadmap', 'metricas', 'config', 'conta', 'mais']

/** Telas de quem ainda não entrou; logado, elas levam ao Início. */
export const PUBLICAS = ['entrar', 'criar-conta', 'esqueci'] as const

export type Rota = {
  /** `null` quando o endereço não leva a lugar nenhum (página 404). */
  destino: Destino | null
  /** Pedaços do caminho: `#/bugs/abc` vira `['bugs', 'abc']`. */
  partes: string[]
  params: URLSearchParams
}

function decodificar(parte: string): string {
  try {
    return decodeURIComponent(parte)
  } catch {
    return parte
  }
}

export function lerRota(): Rota {
  const bruto = window.location.hash.replace(/^#\/?/, '')
  // Volta do link de e-mail do Supabase (#access_token=…, #error=…) não é rota: vale o Início.
  if (!bruto || /(^|&)(access_token|error|type)=/.test(bruto)) {
    return { destino: 'inicio', partes: [], params: new URLSearchParams() }
  }
  const [caminho, consulta = ''] = bruto.split('?')
  const partes = caminho.split('/').filter(Boolean).map(decodificar)
  const primeira = partes[0] ?? ''
  let destino: Destino | null = DESTINOS.find((d) => d === primeira) ?? null
  if (!primeira || (PUBLICAS as readonly string[]).includes(primeira)) destino = 'inicio'
  return { destino, partes, params: new URLSearchParams(consulta) }
}

export const hrefDe = (destino: Destino) => `#/${destino}`

/** Rota atual guardada no hash (#/bugs/abc?f=a_triar): dá para voltar com o botão do navegador. */
export function useRota(): [Rota, (href: string, opcoes?: { substituir?: boolean }) => void] {
  const [rota, setRota] = useState(lerRota)

  useEffect(() => {
    const sincronizar = () => setRota(lerRota())
    window.addEventListener('hashchange', sincronizar)
    window.addEventListener('popstate', sincronizar)
    return () => {
      window.removeEventListener('hashchange', sincronizar)
      window.removeEventListener('popstate', sincronizar)
    }
  }, [])

  const ir = useCallback((href: string, opcoes?: { substituir?: boolean }) => {
    if (window.location.hash !== href) {
      if (opcoes?.substituir) window.history.replaceState(null, '', href)
      else window.history.pushState(null, '', href)
    }
    setRota(lerRota())
  }, [])

  return [rota, ir]
}

/** Só o destino (para quem não precisa de partes nem parâmetros). */
export function useDestino(): [Destino | null, (destino: Destino) => void] {
  const [rota, ir] = useRota()
  const irPara = useCallback((destino: Destino) => ir(hrefDe(destino)), [ir])
  return [rota.destino, irPara]
}
