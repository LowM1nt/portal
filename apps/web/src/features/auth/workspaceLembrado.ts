/**
 * Workspace escolhido por último, guardado por usuário só por conveniência (recarregar não volta ao primeiro).
 * Nunca é confiável sozinho: quem usa confere se o id ainda está na lista de /api/me, e a API valida o acesso
 * em toda chamada (X-Workspace-Id). Armazenamento bloqueado ou vazio: vale o primeiro workspace.
 */

const chave = (usuarioId: string) => `releasy-workspace:${usuarioId}`

export function workspaceLembrado(usuarioId: string): string | null {
  try {
    const valor = window.localStorage.getItem(chave(usuarioId))
    return valor && valor.length <= 100 ? valor : null
  } catch {
    return null
  }
}

export function lembrarWorkspace(usuarioId: string, workspaceId: string) {
  try {
    window.localStorage.setItem(chave(usuarioId), workspaceId)
  } catch {
    // armazenamento bloqueado: no pior caso, volta ao primeiro workspace no próximo acesso
  }
}

export function esquecerWorkspace(usuarioId: string) {
  try {
    window.localStorage.removeItem(chave(usuarioId))
  } catch {
    // nada a fazer
  }
}
