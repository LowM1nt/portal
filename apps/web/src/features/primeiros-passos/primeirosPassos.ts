import { useEffect, useRef, useState } from 'react'
import { useAuth, type Workspace } from '../auth/AuthProvider.tsx'
import { lerConfigGithub } from '../config/api.ts'
import { convitePendente } from '../convite/convite.ts'

/**
 * Primeiros passos (onboarding): Workspace → GitHub → Repositórios → Time, em `#/primeiros-passos?passo=1..4`.
 *
 * Quando aparece sozinho (uma vez, ao abrir o Início):
 * - a pessoa está em um workspace só, e é dona dele (é o pessoal, criado no 1º acesso);
 * - não tem convite guardado para aceitar (quem chega por convite entra no time de alguém);
 * - o GitHub desse workspace não está configurado (GET /api/integracoes/github → configurado: false);
 * - ainda não concluiu nem pulou ("Fazer depois") neste navegador.
 *
 * A escolha fica no localStorage por usuário só por conveniência: se sumir, o pior que acontece é o
 * onboarding aparecer de novo. Nada de segurança depende disso. Dá pra retomar em Configurações.
 */

export const PASSOS = ['Workspace', 'GitHub', 'Repositórios', 'Time'] as const

/** Nome que a API dá ao workspace pessoal no 1º acesso. */
export const NOME_PADRAO = 'Meu workspace'

/** Mesmo limite da API (Workspace.NomeMaximo). */
export const NOME_MAXIMO = 100

export type Escolha = 'concluido' | 'pulado'

const chave = (usuarioId: string) => `releasy-primeiros-passos:${usuarioId}`

export const hrefPasso = (passo: number) => `#/primeiros-passos?passo=${passo}`

/** `?passo=` fora de 1..4 (ou ausente) vale o primeiro. */
export function passoDaRota(params: URLSearchParams): number {
  const n = Number(params.get('passo'))
  return Number.isInteger(n) && n >= 1 && n <= PASSOS.length ? n : 1
}

export function escolhaFeita(usuarioId: string): Escolha | null {
  try {
    const valor = window.localStorage.getItem(chave(usuarioId))
    return valor === 'concluido' || valor === 'pulado' ? valor : null
  } catch {
    return null
  }
}

export function guardarEscolha(usuarioId: string, escolha: Escolha) {
  try {
    window.localStorage.setItem(chave(usuarioId), escolha)
  } catch {
    // armazenamento bloqueado: no pior caso, o onboarding aparece de novo no próximo acesso
  }
}

/** A parte do critério que não depende da API (a do GitHub é conferida depois). */
export function candidato(usuarioId: string | null, workspaces: Workspace[], comConvite: boolean): usuarioId is string {
  return Boolean(usuarioId) && !comConvite && workspaces.length === 1 && workspaces[0].papel === 'dono' && !escolhaFeita(usuarioId as string)
}

/** No Início, leva para os Primeiros passos quando o critério acima bate. Confere uma vez por montagem. */
export function usePrimeirosPassosAutomatico(noInicio: boolean, ir: (href: string, opcoes?: { substituir?: boolean }) => void) {
  const { estado, usuarioId, workspaces, api } = useAuth()
  const conferido = useRef(false)
  // Lido na montagem: o aceite do convite tira o token do armazenamento logo em seguida.
  const [comConvite] = useState(() => convitePendente() !== null)

  useEffect(() => {
    if (estado !== 'pronto' || !noInicio || conferido.current) return
    if (!candidato(usuarioId, workspaces, comConvite)) {
      conferido.current = true
      return
    }
    // Saiu do Início antes da resposta: cancela (e confere de novo se voltar).
    let ativo = true
    lerConfigGithub(api)
      .then((config) => {
        if (!ativo) return
        conferido.current = true
        if (!config.configurado) ir(hrefPasso(1), { substituir: true })
      })
      .catch(() => {
        // Sem resposta do GitHub: não insiste nesta visita (não atrapalha o Início).
        if (ativo) conferido.current = true
      })
    return () => {
      ativo = false
    }
  }, [estado, noInicio, usuarioId, workspaces, comConvite, api, ir])
}
