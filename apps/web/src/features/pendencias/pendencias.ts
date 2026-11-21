import { createContext, useContext } from 'react'
import type { Bug } from '../bugs/api.ts'
import type { PrRevisao } from '../revisoes/api.ts'
import type { Recurso } from '../../ui/useCarregar.ts'

/** Bugs e fila de revisão do workspace: alimentam os contadores do dock, o Início e a tela de bugs. */
export type Pendencias = { bugs: Recurso<Bug[]>; revisoes: Recurso<PrRevisao[]> }

export const PendenciasContexto = createContext<Pendencias | null>(null)

export function usePendencias(): Pendencias {
  const valor = useContext(PendenciasContexto)
  if (!valor) throw new Error('usePendencias precisa estar dentro de PendenciasProvider.')
  return valor
}

/** Contadores (só quando os dados chegaram): bugs a triar e PRs esperando revisão. */
export function contadores({ bugs, revisoes }: Pendencias) {
  return {
    bugsATriar: bugs.dados ? bugs.dados.filter((b) => b.status === 'a_triar').length : null,
    revisoes: revisoes.dados ? revisoes.dados.length : null,
  }
}
