export type OpcoesApi = {
  token: string
  workspaceId: string | null
  onNaoAutorizado: () => void
  init?: RequestInit
}

const base = import.meta.env.VITE_API_URL ?? ''

export async function chamarApi(caminho: string, opcoes: OpcoesApi): Promise<Response> {
  const cabecalhos = new Headers(opcoes.init?.headers)
  cabecalhos.set('Authorization', `Bearer ${opcoes.token}`)
  if (opcoes.workspaceId) cabecalhos.set('X-Workspace-Id', opcoes.workspaceId)
  const resposta = await fetch(`${base}${caminho}`, { ...opcoes.init, headers: cabecalhos })
  if (resposta.status === 401) opcoes.onNaoAutorizado()
  return resposta
}
