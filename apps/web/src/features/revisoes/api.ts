export type StatusCi = 'sucesso' | 'falhou' | 'rodando' | 'sem CI'

export type PrRevisao = {
  numero: number
  titulo: string
  autor: string
  url: string
  repositorio: string
  revisores: string[]
  statusCi: StatusCi
  atualizadaEm: string
}

type Api = (caminho: string, init?: RequestInit) => Promise<Response>

/** Busca a lista inteira (sem filtros no servidor); lança erro se a resposta não for uma lista. */
export async function buscarFila(api: Api): Promise<PrRevisao[]> {
  const resposta = await api('/api/revisoes')
  if (!resposta.ok) throw new Error(`Falha ${resposta.status}`)
  const corpo: unknown = await resposta.json()
  if (!Array.isArray(corpo)) throw new Error('Resposta inválida')
  return corpo as PrRevisao[]
}
