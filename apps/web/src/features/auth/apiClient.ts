export type OpcoesApi = {
  token: string
  workspaceId: string | null
  onNaoAutorizado: () => void
  /** A API recusou porque a pessoa exige duas etapas e a sessão ainda é aal1 (403 `mfa_necessario`, D-013). */
  onMfaNecessario?: () => void
  init?: RequestInit
}

export const base = import.meta.env.VITE_API_URL ?? ''

/** Código estável que a API manda no 403 quando falta confirmar o código de duas etapas. */
export const CODIGO_MFA_NECESSARIO = 'mfa_necessario'

async function pedeMfa(resposta: Response): Promise<boolean> {
  try {
    const corpo = (await resposta.clone().json()) as { codigo?: unknown } | null
    return corpo?.codigo === CODIGO_MFA_NECESSARIO
  } catch {
    return false
  }
}

export async function chamarApi(caminho: string, opcoes: OpcoesApi): Promise<Response> {
  const cabecalhos = new Headers(opcoes.init?.headers)
  cabecalhos.set('Authorization', `Bearer ${opcoes.token}`)
  if (opcoes.workspaceId) cabecalhos.set('X-Workspace-Id', opcoes.workspaceId)
  const resposta = await fetch(`${base}${caminho}`, { ...opcoes.init, headers: cabecalhos })
  if (resposta.status === 401) opcoes.onNaoAutorizado()
  else if (resposta.status === 403 && opcoes.onMfaNecessario && (await pedeMfa(resposta))) opcoes.onMfaNecessario()
  return resposta
}
