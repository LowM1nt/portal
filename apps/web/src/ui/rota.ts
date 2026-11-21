import { useCallback, useEffect, useMemo, useState } from 'react'

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

export function lerRota(hash: string = window.location.hash): Rota {
  const bruto = hash.replace(/^#\/?/, '')
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
  // O estado é o hash (texto): ler de novo o mesmo endereço não redesenha nada.
  const [hash, setHash] = useState(() => window.location.hash)
  const rota = useMemo(() => lerRota(hash), [hash])

  useEffect(() => {
    const sincronizar = () => setHash(window.location.hash)
    window.addEventListener('hashchange', sincronizar)
    window.addEventListener('popstate', sincronizar)
    // O endereço pode ter mudado entre o desenho e a inscrição acima (popstate/hashchange sem ninguém ouvindo):
    // sincroniza uma vez agora para não perder essa navegação.
    sincronizar()
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
    setHash(window.location.hash)
  }, [])

  return [rota, ir]
}

/** Só o destino (para quem não precisa de partes nem parâmetros). */
export function useDestino(): [Destino | null, (destino: Destino) => void] {
  const [rota, ir] = useRota()
  const irPara = useCallback((destino: Destino) => ir(hrefDe(destino)), [ir])
  return [rota.destino, irPara]
}
